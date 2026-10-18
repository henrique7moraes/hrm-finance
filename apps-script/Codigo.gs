/**
 * HRM Finance — servidor da planilha (Google Apps Script)
 *
 * 1. Troque o PIN abaixo pelo seu (4 a 8 números).
 * 2. Salve, selecione a função "configurar" e clique em Executar (uma vez).
 * 3. Implante como "App da Web" (Executar como: Eu | Quem pode acessar: Qualquer pessoa).
 */
const PIN = '0000';

const ABAS = {
  Lancamentos:  ['id', 'dataHora', 'tipo', 'valor', 'categoria', 'pagamento', 'descricao'],
  Categorias:   ['tipo', 'nome', 'cor'],
  Cofrinhos:    ['id', 'nome', 'banco', 'meta', 'criadoEm'],
  MovCofrinhos: ['id', 'dataHora', 'cofrinhoId', 'tipo', 'valor', 'obs'],
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
      anexar_('Lancamentos', {
        id: d.id || novoId_(), dataHora: d.dataHora || agora_(), tipo: d.tipo,
        valor: num_(d.valor), categoria: d.categoria, pagamento: d.pagamento || '',
        descricao: d.descricao || ''
      });
      return;

    case 'editLancamento':
      validarValor_(d.valor);
      atualizar_('Lancamentos', d.id, {
        dataHora: d.dataHora, tipo: d.tipo, valor: num_(d.valor),
        categoria: d.categoria, pagamento: d.pagamento || '', descricao: d.descricao || ''
      });
      return;

    case 'delLancamento':
      remover_('Lancamentos', d.id);
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
      if (nome === 'Lancamentos' || nome === 'MovCofrinhos') sh.getRange('B:B').setNumberFormat('@');
      if (nome === 'Cofrinhos') sh.getRange('E:E').setNumberFormat('@');
      if (nome === 'Categorias') sh.getRange(2, 1, CATEGORIAS_PADRAO.length, 3).setValues(CATEGORIAS_PADRAO);
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
    config: cfg
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
  aba_(nome).appendRow(ABAS[nome].map(c => obj[c] === undefined ? '' : obj[c]));
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
