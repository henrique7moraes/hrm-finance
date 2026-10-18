/**
 * HRM Finance — servidor da planilha (Google Apps Script)
 *
 * 1. Troque o PIN abaixo pelo seu (4 a 8 números).
 * 2. Salve, selecione a função "configurar" e clique em Executar (uma vez).
 * 3. Implante como "App da Web" (Executar como: Eu | Quem pode acessar: Qualquer pessoa).
 */
const PIN = '0000';
const VERSAO = 3;
const CAT_DIZIMO = 'Dízimos e ofertas';

const ABAS = {
  Lancamentos:  ['id', 'dataHora', 'tipo', 'valor', 'categoria', 'pagamento', 'descricao', 'registro', 'origemId', 'parte', 'envioId'],
  Categorias:   ['tipo', 'nome', 'cor'],
  Cofrinhos:    ['id', 'nome', 'banco', 'meta', 'criadoEm'],
  MovCofrinhos: ['id', 'dataHora', 'cofrinhoId', 'tipo', 'valor', 'obs'],
  EnviosIgreja: ['id', 'dataHora', 'dizimo', 'oferta', 'obs'],
  AReceber:     ['id', 'dataHora', 'lancamentoId', 'registro', 'devedor', 'valor', 'status', 'atualizadoEm', 'obs'],
  Config:       ['chave', 'valor']
};

const CATEGORIAS_PADRAO = [
  ['Saída', 'Alimentação', '#F2994A'],
  ['Saída', 'Transporte', '#56CCF2'],
  ['Saída', 'Dízimos e ofertas', '#F2C94C'],
  ['Saída', 'Lazer/social', '#BB6BD9'],
  ['Entrada', 'Salário', '#27AE60'],
  ['Entrada', 'Rendimento', '#6FCF97'],
  ['Entrada', 'Presente', '#EB5757'],
  ['Entrada', 'Subsídio', '#2D9CDB']
];

/** Execute uma vez pelo editor para criar as abas. */
function configurar() {
  preparar_();
  SpreadsheetApp.getActiveSpreadsheet().toast('HRM Finance configurado!');
}

function doGet() {
  return json_({ ok: true, app: 'HRM Finance' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (_) {
    return json_({ ok: false, erro: 'Requisição inválida.' });
  }
  if (String(req.pin) !== String(PIN)) {
    Utilities.sleep(800);
    return json_({ ok: false, erro: 'PIN incorreto.' });
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    preparar_();
    executar_(req.acao, req.dados || {});
    return json_({ ok: true, dados: carregar_() });
  } catch (err) {
    return json_({ ok: false, erro: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- ações ---------- */

function executar_(acao, d) {
  switch (acao) {
    case 'carregar':
      return;

    case 'addLancamento':
      if (acharLinha_('Lancamentos', d.id)) return; // já gravado (envio repetido)
      validarValor_(d.valor);
      const nova = anexar_('Lancamentos', {
        id: d.id || novoId_(), dataHora: d.dataHora || agora_(), tipo: d.tipo,
        valor: num_(d.valor), categoria: d.categoria, pagamento: d.pagamento || '',
        descricao: d.descricao || ''
      });
      // Dízimo e oferta separados desta entrada (vêm prontos do app, para funcionar offline)
      if (d.tipo === 'Entrada' && Array.isArray(d.separacoes)) {
        d.separacoes.forEach(sp => {
          if (num_(sp.valor) > 0 && !acharLinha_('Lancamentos', sp.id)) anexar_('Lancamentos', separacao_(nova, sp.parte, sp.valor, sp.id));
        });
      }
      if (d.tipo === 'Saída' && Array.isArray(d.receber)) gravarReceber_(nova, d.receber);
      return;

    case 'editLancamento':
      validarValor_(d.valor);
      atualizar_('Lancamentos', d.id, {
        dataHora: d.dataHora, tipo: d.tipo, valor: num_(d.valor),
        categoria: d.categoria, pagamento: d.pagamento || '', descricao: d.descricao || ''
      });
      if (d.dizimo !== undefined) ajustarSeparacao_(d, d.tipo === 'Entrada' && !!d.dizimo, d.tipo === 'Entrada' ? num_(d.oferta) : 0);
      if (d.receber !== undefined) {
        const ligados = receberDe_(d.id);
        if (!ligados.some(r => r.status === 'Recebido')) {
          ligados.forEach(r => remover_('AReceber', r.id));
          const linha = ler_('Lancamentos').filter(l => String(l.id) === String(d.id))[0];
          if (d.tipo === 'Saída') gravarReceber_({ ...d, registro: linha && linha.registro }, d.receber || []);
        }
      }
      return;

    case 'delLancamento':
      remover_('Lancamentos', d.id);
      separacoesDe_(d.id).filter(s => !s.envioId).forEach(s => remover_('Lancamentos', s.id));
      receberDe_(d.id).forEach(r => remover_('AReceber', r.id));
      return;

    case 'statusReceber': {
      if (['Pendente', 'Nota enviada', 'Recebido'].indexOf(d.status) < 0) throw new Error('Situação inválida.');
      (d.ids || []).forEach(id => {
        if (acharLinha_('AReceber', id)) atualizar_('AReceber', id, { status: d.status, atualizadoEm: d.dataHora || agora_() });
      });
      return;
    }

    case 'enviarIgreja': {
      const pendentes = ler_('Lancamentos').filter(l => l.origemId && !l.envioId);
      if (!pendentes.length) throw new Error('Não há dízimos e ofertas reservados.');
      const soma = parte => num_(pendentes.filter(l => l.parte === parte).reduce((s, l) => s + num_(l.valor), 0));
      const id = d.id || novoId_();
      anexar_('EnviosIgreja', { id: id, dataHora: d.dataHora || agora_(), dizimo: soma('Dízimo'), oferta: soma('Oferta'), obs: d.obs || '' });
      pendentes.forEach(l => atualizar_('Lancamentos', l.id, { envioId: id }));
      return;
    }

    case 'desfazerEnvio':
      ler_('Lancamentos').filter(l => String(l.envioId) === String(d.id))
        .forEach(l => atualizar_('Lancamentos', l.id, { envioId: '' }));
      remover_('EnviosIgreja', d.id);
      return;

    case 'addCategoria': {
      const nome = String(d.nome || '').trim();
      if (!nome) throw new Error('Informe o nome da categoria.');
      const existe = ler_('Categorias').some(c => c.tipo === d.tipo && c.nome.toLowerCase() === nome.toLowerCase());
      if (existe) throw new Error('Essa categoria já existe.');
      anexar_('Categorias', { tipo: d.tipo, nome: nome, cor: d.cor || '#7FB8F0' });
      return;
    }

    case 'delCategoria': {
      const sh = aba_('Categorias');
      const vals = sh.getDataRange().getValues();
      for (let i = vals.length - 1; i >= 1; i--) {
        if (vals[i][0] === d.tipo && vals[i][1] === d.nome) sh.deleteRow(i + 1);
      }
      return;
    }

    case 'setConfig': {
      const sh = aba_('Config');
      const vals = sh.getDataRange().getValues();
      for (let i = 1; i < vals.length; i++) {
        if (vals[i][0] === d.chave) { sh.getRange(i + 1, 2).setValue(d.valor); return; }
      }
      sh.appendRow([d.chave, d.valor]);
      return;
    }

    case 'addCofrinho': {
      const nome = String(d.nome || '').trim();
      if (!nome) throw new Error('Informe o nome do cofrinho.');
      const id = d.id || novoId_();
      anexar_('Cofrinhos', { id: id, nome: nome, banco: String(d.banco || '').trim(), meta: num_(d.meta), criadoEm: agora_() });
      if (num_(d.saldoInicial) > 0) {
        anexar_('MovCofrinhos', { id: novoId_(), dataHora: agora_(), cofrinhoId: id, tipo: 'Inicial', valor: num_(d.saldoInicial), obs: 'Saldo inicial' });
      }
      return;
    }

    case 'editCofrinho':
      atualizar_('Cofrinhos', d.id, { nome: String(d.nome || '').trim(), banco: String(d.banco || '').trim(), meta: num_(d.meta) });
      return;

    case 'delCofrinho':
      if (Math.abs(saldoCofrinho_(d.id)) > 0.004) throw new Error('Resgate o saldo antes de excluir o cofrinho.');
      remover_('Cofrinhos', d.id);
      return;

    case 'movCofrinho': {
      if (['Guardar', 'Resgatar'].indexOf(d.tipo) < 0) throw new Error('Movimento inválido.');
      validarValor_(d.valor);
      if (!acharLinha_('Cofrinhos', d.cofrinhoId)) throw new Error('Cofrinho não encontrado.');
      if (d.tipo === 'Resgatar' && num_(d.valor) > saldoCofrinho_(d.cofrinhoId) + 0.004) {
        throw new Error('O cofrinho não tem esse valor.');
      }
      anexar_('MovCofrinhos', { id: novoId_(), dataHora: d.dataHora || agora_(), cofrinhoId: d.cofrinhoId, tipo: d.tipo, valor: num_(d.valor), obs: d.obs || '' });
      return;
    }

    case 'atualizarSaldo': {
      if (!acharLinha_('Cofrinhos', d.cofrinhoId)) throw new Error('Cofrinho não encontrado.');
      const dif = Math.round((num_(d.novoSaldo) - saldoCofrinho_(d.cofrinhoId)) * 100) / 100;
      if (dif !== 0) {
        anexar_('MovCofrinhos', { id: novoId_(), dataHora: d.dataHora || agora_(), cofrinhoId: d.cofrinhoId, tipo: 'Rendimento', valor: dif, obs: 'Atualização de saldo' });
      }
      return;
    }

    default:
      throw new Error('Ação desconhecida: ' + acao);
  }
}

/* ---------- planilha ---------- */

function preparar_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ABAS).forEach(nome => {
    let sh = ss.getSheetByName(nome);
    if (!sh) {
      sh = ss.insertSheet(nome);
      sh.getRange(1, 1, 1, ABAS[nome].length).setValues([ABAS[nome]]).setFontWeight('bold');
      sh.setFrozenRows(1);
      if (['Lancamentos', 'MovCofrinhos', 'EnviosIgreja', 'AReceber'].indexOf(nome) >= 0) sh.getRange('B:B').setNumberFormat('@');
      if (nome === 'AReceber') sh.getRange('H:H').setNumberFormat('@');
      if (nome === 'Cofrinhos') sh.getRange('E:E').setNumberFormat('@');
      if (nome === 'Categorias') sh.getRange(2, 1, CATEGORIAS_PADRAO.length, 3).setValues(CATEGORIAS_PADRAO);
    } else {
      // Planilha de uma versão anterior: acrescenta as colunas novas no fim
      const cab = ABAS[nome], n = sh.getLastColumn();
      if (n < cab.length) {
        sh.getRange(1, n + 1, 1, cab.length - n).setValues([cab.slice(n)]).setFontWeight('bold');
        if (nome === 'Lancamentos') numerarRegistros_(sh);
      }
    }
  });
  const padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao && padrao.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(padrao);
}

function carregar_() {
  const cfg = {};
  ler_('Config').forEach(r => { cfg[r.chave] = r.valor; });
  return {
    lancamentos: ler_('Lancamentos').map(r => ({ ...r, valor: num_(r.valor) })),
    categorias: ler_('Categorias'),
    cofrinhos: ler_('Cofrinhos').map(r => ({ ...r, meta: num_(r.meta) })),
    movimentos: ler_('MovCofrinhos').map(r => ({ ...r, valor: num_(r.valor) })),
    envios: ler_('EnviosIgreja').map(r => ({ ...r, dizimo: num_(r.dizimo), oferta: num_(r.oferta) })),
    receber: ler_('AReceber').map(r => ({ ...r, valor: num_(r.valor) })),
    config: cfg,
    versao: VERSAO
  };
}

function aba_(nome) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
}

function ler_(nome) {
  const vals = aba_(nome).getDataRange().getValues();
  const cab = vals.shift();
  const tz = Session.getScriptTimeZone();
  return vals
    .filter(l => l.some(v => v !== '' && v !== null))
    .map(l => {
      const o = {};
      cab.forEach((c, i) => {
        const v = l[i];
        o[c] = v instanceof Date ? Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ss") : v;
      });
      return o;
    });
}

function anexar_(nome, obj) {
  if (nome === 'Lancamentos' && !obj.registro) obj = { ...obj, registro: proximoRegistro_() };
  aba_(nome).appendRow(ABAS[nome].map(c => obj[c] === undefined ? '' : obj[c]));
  return obj;
}

function acharLinha_(nome, id) {
  if (!id) return 0;
  const ids = aba_(nome).getRange('A:A').getValues();
  for (let i = 1; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 1;
  return 0;
}

function atualizar_(nome, id, campos) {
  const linha = acharLinha_(nome, id);
  if (!linha) throw new Error('Registro não encontrado.');
  const sh = aba_(nome);
  ABAS[nome].forEach((c, i) => {
    if (campos[c] !== undefined) sh.getRange(linha, i + 1).setValue(campos[c]);
  });
}

function remover_(nome, id) {
  const linha = acharLinha_(nome, id);
  if (linha) aba_(nome).deleteRow(linha);
}

function saldoCofrinho_(id) {
  return ler_('MovCofrinhos')
    .filter(m => String(m.cofrinhoId) === String(id))
    .reduce((s, m) => s + (m.tipo === 'Resgatar' ? -num_(m.valor) : num_(m.valor)), 0);
}

/* ---------- registros ---------- */

/** Número de registro de cada lançamento (1, 2, 3…). O dízimo e a oferta reutilizam o número da entrada. */
function proximoRegistro_() {
  const col = ABAS.Lancamentos.indexOf('registro') + 1;
  const vals = aba_('Lancamentos').getRange(1, col, Math.max(aba_('Lancamentos').getLastRow(), 1), 1).getValues();
  return vals.slice(1).reduce((m, r) => Math.max(m, parseInt(r[0], 10) || 0), 0) + 1;
}

/** Planilha antiga: dá número aos lançamentos que ainda não têm, na ordem das linhas. */
function numerarRegistros_(sh) {
  const n = sh.getLastRow();
  if (n < 2) return;
  const col = ABAS.Lancamentos.indexOf('registro') + 1;
  sh.getRange(2, col, n - 1, 1).setValues(Array.from({ length: n - 1 }, (_, i) => [i + 1]));
}

/* ---------- dízimos e ofertas ---------- */

/** Dízimo = 10% arredondado para cima no centavo. A oferta (opcional) é sugerida igual ao dízimo e pode ser mudada. */
function dizimoDe_(valor) {
  return Math.ceil(Math.round(num_(valor) * 100) / 10) / 100;
}

function separacao_(entrada, parte, valor, id) {
  return {
    id: id || novoId_(), dataHora: entrada.dataHora || agora_(), tipo: 'Saída',
    valor: num_(valor), categoria: CAT_DIZIMO, pagamento: 'Pix',
    descricao: parte + ' · ' + (entrada.descricao || entrada.categoria),
    registro: entrada.registro, origemId: entrada.id, parte: parte  // mesmo registro da entrada
  };
}

function separacoesDe_(origemId) {
  return ler_('Lancamentos').filter(l => l.origemId && String(l.origemId) === String(origemId));
}

/** Depois de editar uma entrada: cria, atualiza ou remove o dízimo e a oferta dela (o que já foi enviado não muda). */
function ajustarSeparacao_(entrada, dizimo, oferta) {
  const seps = separacoesDe_(entrada.id);
  if (seps.some(sp => sp.envioId)) return;
  const linha = ler_('Lancamentos').filter(l => String(l.id) === String(entrada.id))[0];
  entrada = { ...entrada, registro: linha && linha.registro };
  const valores = { 'Dízimo': dizimo ? dizimoDe_(entrada.valor) : 0, 'Oferta': num_(oferta) };
  Object.keys(valores).forEach(parte => {
    const atual = seps.filter(sp => sp.parte === parte)[0];
    if (valores[parte] <= 0) { if (atual) remover_('Lancamentos', atual.id); return; }
    const nova = separacao_(entrada, parte, valores[parte], atual && atual.id);
    if (atual) atualizar_('Lancamentos', atual.id, nova);
    else anexar_('Lancamentos', nova);
  });
}

/* ---------- a receber (reembolsos da igreja e divisões com outras pessoas) ---------- */

function receberDe_(lancamentoId) {
  return ler_('AReceber').filter(r => String(r.lancamentoId) === String(lancamentoId));
}

/** Grava quem vai devolver parte de uma saída. O que se recebe de volta não conta como gasto. */
function gravarReceber_(saida, lista) {
  const total = lista.reduce((s, r) => s + num_(r.valor), 0);
  if (total > num_(saida.valor) + 0.004) throw new Error('O valor a receber é maior que o valor pago.');
  lista.forEach(r => {
    const devedor = String(r.devedor || '').trim();
    if (!devedor || !(num_(r.valor) > 0) || acharLinha_('AReceber', r.id)) return;
    anexar_('AReceber', {
      id: r.id || novoId_(), dataHora: saida.dataHora || agora_(), lancamentoId: saida.id, registro: saida.registro,
      devedor: devedor, valor: num_(r.valor), status: r.status || 'Pendente', atualizadoEm: '', obs: ''
    });
  });
}

/* ---------- utilidades ---------- */

function num_(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v || '0').replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function validarValor_(v) {
  if (!(num_(v) > 0)) throw new Error('Informe um valor maior que zero.');
}

function novoId_() {
  return Utilities.getUuid();
}

function agora_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
