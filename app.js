'use strict';
/* HRM Finance — app de controle financeiro pessoal
   Dados: Google Sheets (via Apps Script). Telas: este arquivo. */

const VERSAO_APP = '2.1';
const NOME = 'Henrique';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRL_CURTO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const r2 = v => Math.round((+v || 0) * 100) / 100;
const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmt = v => BRL.format(r2(v));
const BRL_INTEIRO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
/* Sem centavos quando o valor é redondo */
const fmtSimples = v => Math.abs(r2(v) % 1) < 0.005 ? BRL_INTEIRO.format(r2(v)) : fmt(v);
const fmtCurto = v => Math.abs(v) >= 10000 ? BRL_CURTO.format(v) : fmt(v);
const sinal = v => (v > 0.004 ? '+' : v < -0.004 ? '−' : '') + fmt(Math.abs(v));

const PAGAMENTOS = ['Pix', 'Débito', 'Dinheiro'];
const CAT_DIZIMO = 'Dízimos e ofertas';
/* Dízimo = 10% arredondado para cima no centavo; a oferta começa igual ao dízimo e pode ser mudada */
const dizimoDe = v => Math.ceil(Math.round(num(v) * 100) / 10) / 100;
const ehSeparacao = l => !!l.origemId;
const CORES = ['#F2994A', '#56CCF2', '#F2C94C', '#BB6BD9', '#27AE60', '#6FCF97', '#EB5757', '#2D9CDB',
  '#FF8FB1', '#A3E635', '#FFB86B', '#9B8CFF', '#4DD4C6', '#C0C7D6'];

/* Palavras que ajudam a sugerir a categoria quando a descrição é nova */
const PALAVRAS = {
  'Alimentação': ['mercado', 'supermercado', 'almoco', 'jantar', 'lanche', 'padaria', 'ifood', 'restaurante', 'cafe', 'acai', 'pizza', 'feira', 'acougue', 'comida', 'hortifruti', 'sorvete'],
  'Transporte': ['uber', '99', 'onibus', 'gasolina', 'combustivel', 'passagem', 'taxi', 'estacionamento', 'moto', 'oficina', 'pedagio', 'mototaxi', 'barco'],
  'Dízimos e ofertas': ['dizimo', 'oferta', 'igreja', 'missoes', 'pacto'],
  'Lazer/social': ['cinema', 'passeio', 'aniversario', 'viagem', 'praia', 'show', 'jogo', 'festa', 'sorveteria', 'confraternizacao'],
  'Salário': ['salario', 'pagamento', 'holerite'],
  'Rendimento': ['rendimento', 'juros', 'cdb'],
  'Presente': ['presente', 'aniversario'],
  'Subsídio': ['subsidio', 'bolsa', 'ajuda de custo', 'auxilio']
};

/* ---------- armazenamento local ---------- */
function lsGet(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { } }
function ssGet(k) { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } }
function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch { } }
function ssDel(k) { try { sessionStorage.removeItem(k); } catch { } }

/* ---------- datas ---------- */
const pad = n => String(n).padStart(2, '0');
const maiuscula = s => s.charAt(0).toUpperCase() + s.slice(1);
function isoLocal(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const chaveMes = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
function mudaMes(chave, delta) { const [a, m] = chave.split('-').map(Number); return chaveMes(new Date(a, m - 1 + delta, 1)); }
function nomeMes(chave, comAno = true) {
  const [a, m] = chave.split('-').map(Number);
  const nome = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return comAno && a !== new Date().getFullYear() ? `${nome} de ${a}` : nome;
}
function paraData(s) { const d = new Date(String(s)); return isNaN(d) ? new Date() : d; }
function rotuloDia(diaIso) {
  const hoje = isoLocal().slice(0, 10);
  const ontem = isoLocal(new Date(Date.now() - 864e5)).slice(0, 10);
  if (diaIso === hoje) return 'Hoje';
  if (diaIso === ontem) return 'Ontem';
  return maiuscula(paraData(diaIso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
}
const hora = s => String(s).slice(11, 16);
function dataCurta(s) { return paraData(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''); }

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/* ---------- estado ---------- */
const S = {
  url: lsGet('hrm_url', ''),
  pedirPin: lsGet('hrm_pedir_pin', false),
  pin: '',
  base: lsGet('hrm_dados', null),   // última cópia vinda da planilha
  fila: lsGet('hrm_fila', []),      // lançamentos ainda não enviados
  dados: null,                      // base + fila
  view: 'painel',
  mes: chaveMes(),
  filtro: 'todos',
  busca: '',
  origem: 'painel',                 // aba de onde se abriu uma subtela
  abaOrc: 'gastos',
  per: 'mes', cmp: 'ant', refAn: chaveMes(),
  tema: lsGet('hrm_tema', 'claro'),
  form: null,
  status: 'ok',
  pinDig: '',
  erroCarga: '',
  urlSugerida: ''
};
S.pin = S.pedirPin ? ssGet('hrm_pin') : lsGet('hrm_pin', '');

function guardarPin() {
  if (S.pedirPin) { ssSet('hrm_pin', S.pin); lsDel('hrm_pin'); }
  else { lsSet('hrm_pin', S.pin); }
}
function esquecerPin() { S.pin = ''; lsDel('hrm_pin'); ssDel('hrm_pin'); }

function normalizarBase(d) {
  if (!d) return null;
  return {
    lancamentos: d.lancamentos || [], categorias: d.categorias || [], cofrinhos: d.cofrinhos || [],
    movimentos: d.movimentos || [], envios: d.envios || [], receber: d.receber || [],
    compromissos: d.compromissos || [], config: d.config || {}, versao: d.versao || 1
  };
}
function mesclarFila(base) {
  if (!base) return null;
  const d = { ...base, lancamentos: base.lancamentos.slice(), receber: base.receber.slice(), compromissos: base.compromissos.slice() };
  const ids = new Set(d.lancamentos.map(l => String(l.id)));
  const idsRec = new Set(d.receber.map(r => String(r.id)));
  for (const f of S.fila) {
    if (f.acao === 'pagarCompromisso') {
      // Mostra já como pago enquanto o envio não sobe
      d.compromissos = d.compromissos.map(c => String(c.id) === String(f.dados.id) ? compromissoPago(c, f.dados) : c);
      continue;
    }
    if (f.acao !== 'addLancamento') continue;
    if (!ids.has(String(f.dados.id))) d.lancamentos.push({ ...f.dados, _pendente: true });
    for (const sep of f.dados.separacoes || []) {
      if (!ids.has(String(sep.id))) d.lancamentos.push({ ...sep, _pendente: true });
    }
    for (const r of f.dados.receber || []) {
      if (!idsRec.has(String(r.id))) d.receber.push({ ...r, dataHora: f.dados.dataHora, lancamentoId: f.dados.id, _pendente: true });
    }
  }
  return d;
}
function recalcular() { S.dados = mesclarFila(S.base); }
function receber(d) { S.base = normalizarBase(d); lsSet('hrm_dados', S.base); recalcular(); }
function salvarFila() { lsSet('hrm_fila', S.fila); recalcular(); atualizarSync(); }

/* ---------- comunicação com a planilha ---------- */
async function chamar(acao, dados = {}, pin = S.pin, url = S.url) {
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ pin, acao, dados })
    });
  } catch {
    const e = new Error('Sem conexão com a internet.'); e.offline = true; throw e;
  }
  let j;
  try { j = await r.json(); }
  catch { throw new Error('A planilha não respondeu como esperado. Confira o link e se a implantação está liberada para "Qualquer pessoa".'); }
  if (!j.ok) { const e = new Error(j.erro || 'Erro desconhecido.'); e.pin = j.erro === 'PIN incorreto.'; e.servidor = true; throw e; }
  return j.dados;
}

let ocupado = false;
function marcarOcupado(v) { ocupado = v; document.body.classList.toggle('ocupado', v); }

async function executar(acao, dados, msgOk) {
  if (ocupado) return false;
  marcarOcupado(true);
  try {
    receber(await chamar(acao, dados));
    S.status = 'ok';
    if (msgOk) avisar(msgOk);
    return true;
  } catch (e) {
    tratarErro(e);
    return false;
  } finally {
    marcarOcupado(false);
    atualizarSync();
  }
}

function tratarErro(e) {
  if (e.pin) {
    esquecerPin();
    fecharFolha();
    avisar('PIN incorreto. Digite novamente.', true);
    render();
  } else if (e.offline) {
    S.status = 'offline';
    avisar('Sem conexão. Tente de novo quando estiver online.', true);
  } else {
    avisar(e.message, true);
  }
}

let processando = false;
async function processarFila() {
  if (processando || !S.url || !S.pin) return;
  if (!S.fila.length) { atualizarSync(); return; }
  processando = true;
  atualizarSync();
  try {
    while (S.fila.length) {
      const item = S.fila[0];
      const d = await chamar(item.acao, item.dados);
      S.fila.shift();
      lsSet('hrm_fila', S.fila);
      receber(d);
    }
    S.status = 'ok';
  } catch (e) {
    if (e.pin) { tratarErro(e); }
    else if (e.offline || !e.servidor) { S.status = e.offline ? 'offline' : 'erro'; }
    else {
      S.fila.shift(); lsSet('hrm_fila', S.fila); recalcular();
      S.status = 'erro';
      avisar('Um lançamento não foi salvo: ' + e.message, true);
    }
  } finally {
    processando = false;
    atualizarSync();
    renderSuave();
  }
}

async function atualizar(mostrar) {
  if (!S.url || !S.pin) return;
  if (S.fila.length) return processarFila();
  try {
    receber(await chamar('carregar'));
    S.status = 'ok'; S.erroCarga = '';
    if (mostrar) avisar('Dados atualizados');
  } catch (e) {
    if (e.pin) return tratarErro(e);
    S.status = e.offline ? 'offline' : 'erro';
    if (!S.base) S.erroCarga = e.message;
    if (mostrar) avisar(e.message, true);
  }
  atualizarSync();
  renderSuave();
}

function enfileirar(item) { S.fila.push(item); salvarFila(); }

/* ---------- cálculos ---------- */
/* Quanto de cada saída vai voltar (reembolso da igreja ou divisão com outras pessoas) */
function receberPorLanc(d) {
  const m = {};
  for (const r of d.receber) m[String(r.lancamentoId)] = (m[String(r.lancamentoId)] || 0) + num(r.valor);
  return m;
}
/* Gasto de verdade: o que foi pago menos o que vai voltar */
const gastoLiquido = (l, rec) => r2(num(l.valor) - (l.tipo === 'Entrada' ? 0 : (rec[String(l.id)] || 0)));

function calcular(d, mes) {
  const ini = num(d.config.saldoInicial);
  const rec = receberPorLanc(d);
  let ent = 0, sai = 0, entMes = 0, saiMes = 0;
  const porCat = {};
  for (const l of d.lancamentos) {
    const v = num(l.valor);
    const noMes = String(l.dataHora).slice(0, 7) === mes;
    if (l.tipo === 'Entrada') { ent += v; if (noMes) entMes += v; }
    else {
      sai += v;
      const liq = gastoLiquido(l, rec);
      if (noMes && liq > 0) { saiMes += liq; porCat[l.categoria] = (porCat[l.categoria] || 0) + liq; }
    }
  }
  // A receber: sai da carteira quando se paga, volta quando a pessoa ou a igreja devolve
  let recebido = 0, aReceber = 0;
  for (const r of d.receber) { if (r.status === 'Recebido') recebido += num(r.valor); else aReceber += num(r.valor); }
  const saldoCofre = {}, rendCofreMes = {};
  let guard = 0, resg = 0, guardMes = 0, resgMes = 0, rendMes = 0;
  for (const m of d.movimentos) {
    const v = num(m.valor), id = String(m.cofrinhoId);
    const noMes = String(m.dataHora).slice(0, 7) === mes;
    saldoCofre[id] = (saldoCofre[id] || 0) + (m.tipo === 'Resgatar' ? -v : v);
    if (m.tipo === 'Guardar') { guard += v; if (noMes) guardMes += v; }
    else if (m.tipo === 'Resgatar') { resg += v; if (noMes) resgMes += v; }
    else if (m.tipo === 'Rendimento' && noMes) { rendMes += v; rendCofreMes[id] = (rendCofreMes[id] || 0) + v; }
  }
  // Dízimos e ofertas separados que ainda não foram enviados à igreja (já contaram como saída)
  const pendIgreja = d.lancamentos.filter(l => ehSeparacao(l) && !l.envioId);
  const reservado = r2(pendIgreja.reduce((s, l) => s + num(l.valor), 0));
  const dizimoRes = r2(pendIgreja.filter(l => l.parte === 'Dízimo').reduce((s, l) => s + num(l.valor), 0));
  const carteira = r2(ini + ent - sai - guard + resg + recebido);
  const totalCofres = r2(d.cofrinhos.reduce((s, c) => s + (saldoCofre[String(c.id)] || 0), 0));
  aReceber = r2(aReceber);
  return {
    carteira, totalCofres, aReceber, total: r2(carteira + totalCofres + aReceber),
    entMes: r2(entMes), saiMes: r2(saiMes), saldoMes: r2(entMes - saiMes),
    guardadoMes: r2(guardMes - resgMes), rendMes: r2(rendMes),
    porCat, saldoCofre, rendCofreMes, reservado, pendIgreja, dizimoRes, ofertaRes: r2(reservado - dizimoRes)
  };
}
const saldoDoCofre = id => r2(calcular(S.dados, chaveMes()).saldoCofre[String(id)] || 0);

function categorias(tipo) { return S.dados.categorias.filter(c => c.tipo === tipo); }
function corCat(tipo, nome) {
  const c = S.dados.categorias.find(c => c.tipo === tipo && c.nome === nome)
    || S.dados.categorias.find(c => c.nome === nome);
  return c && /^#[0-9a-f]{6}$/i.test(c.cor) ? c.cor : '#8EA3C7';
}

/* ---------- interface: utilidades ---------- */
let tAviso;
function avisar(msg, erro) {
  const el = $('#aviso');
  el.textContent = msg;
  el.classList.toggle('erro', !!erro);
  el.classList.add('on');
  clearTimeout(tAviso);
  tAviso = setTimeout(() => el.classList.remove('on'), erro ? 4200 : 2200);
}

function atualizarSync() {
  const el = $('#sync');
  if (!el) return;
  el.className = 'sync' + (S.fila.length ? ' pendente' : (S.status === 'offline' || S.status === 'erro') ? ' offline' : '');
  el.title = S.fila.length ? `${S.fila.length} lançamento(s) aguardando envio`
    : S.status === 'offline' ? 'Sem conexão' : S.status === 'erro' ? 'Erro ao sincronizar' : 'Sincronizado';
}

function mostrarMolde(v) {
  $('#nav').hidden = !v;
}

function aplicarTema() {
  document.documentElement.dataset.tema = S.tema === 'escuro' ? 'escuro' : 'claro';
  const m = $('meta[name="theme-color"]');
  if (m) m.content = S.tema === 'escuro' ? '#0B1426' : '#F4F6FA';
}

const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

/* Cabeçalho de cada tela: nome da tela, sincronização e menu (ou voltar, nas subtelas) */
function cabecalho(titulo, o = {}) {
  return `
  <header class="cab">
    <div class="cab-titulo">
      ${o.voltar ? `<button class="btn-redondo" data-view="${o.voltar}" aria-label="Voltar">${icone.esq}</button>` : ''}
      <div>${o.sobre ? `<span class="sobre">${esc(o.sobre)}</span>` : ''}<h1>${esc(titulo)}</h1></div>
    </div>
    <div class="cab-acoes">
      <span class="sync" id="sync"></span>
      ${o.extra || ''}
      ${o.voltar ? '' : `<button class="btn-redondo" data-acao="menu" aria-label="Mais opções">${icone.menu}</button>`}
    </div>
  </header>`;
}

function abrirFolha(html, aoAbrir, lateral) {
  const f = $('#folha');
  f.innerHTML = html;
  f.classList.toggle('lateral', !!lateral);
  f.hidden = false;
  $('#folhaFundo').hidden = false;
  document.body.style.overflow = 'hidden';
  if (!(history.state && history.state.folha)) history.pushState({ folha: true }, '');
  if (aoAbrir) setTimeout(aoAbrir, 60);
}
function fecharFolha(viaVoltar) {
  const f = $('#folha');
  if (f.hidden) return;
  f.hidden = true;
  $('#folhaFundo').hidden = true;
  f.innerHTML = '';
  document.body.style.overflow = '';
  if (!viaVoltar && history.state && history.state.folha) history.back();
}
const folhaAberta = () => !$('#folha').hidden;

const icone = {
  sobe: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  desce: '<svg viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
  esq: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  dir: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  mais: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  lista: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  lapis: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  lixo: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  dica: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  busca: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  pdf: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v6M9.5 15.5 12 18l2.5-2.5"/></svg>',
  compromisso: '<svg viewBox="0 0 24 24"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/></svg>',
  porco: '<svg viewBox="0 0 24 24"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/></svg>',
  igreja: '<svg viewBox="0 0 24 24"><path d="M10 9h4"/><path d="M12 7v5"/><path d="M14 22v-4a2 2 0 0 0-4 0v4"/><path d="M18 22V5.6a1 1 0 0 0-.55-.9l-4.56-2.27a2 2 0 0 0-1.78 0L6.55 4.7a1 1 0 0 0-.55.9V22"/><path d="m18 9 3.45 1.72a1 1 0 0 1 .55.9V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8.38a1 1 0 0 1 .55-.9L6 9"/></svg>',
  receber: '<svg viewBox="0 0 24 24"><path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17"/><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 16 6 6"/><circle cx="16" cy="9" r="2.9"/><circle cx="6" cy="5" r="3"/></svg>'
};

/* ---------- render principal ---------- */
function render() {
  if (!S.url) return telaConectar();
  if (!S.pin) return telaPin();
  if (!S.dados) return telaCarregando();
  const ini = S.dados.config.saldoInicial;
  if (ini === undefined || ini === null || ini === '') return telaSaldoInicial();

  mostrarMolde(true);
  if (S.view === 'lancar' && !S.form) S.form = novoForm();
  const views = { painel, fluxo, lancar, analise, economias, dizimos, receber: telaReceber,
    orcamento: telaOrcamento, compromissos: telaCompromissos };
  $('#tela').innerHTML = (views[S.view] || painel)();
  $$('#nav [data-view]').forEach(b => b.classList.toggle('ativo', b.dataset.view === S.view));
  atualizarSync();
}

/* Atualiza a tela só se o usuário não estiver digitando ou com uma janela aberta */
function renderSuave() {
  const ativo = document.activeElement;
  const digitando = ativo && /INPUT|TEXTAREA|SELECT/.test(ativo.tagName);
  if (S.dados && S.url && S.pin && (folhaAberta() || S.view === 'lancar' || digitando)) { atualizarSync(); return; }
  render();
}

const ABAS = ['painel', 'fluxo', 'analise', 'orcamento'];
function irPara(view) {
  fecharFolha();
  if (ABAS.includes(S.view) && !ABAS.includes(view)) S.origem = S.view;
  S.view = view;
  S.form = view === 'lancar' ? novoForm() : null;
  render();
  window.scrollTo(0, 0);
  if (view === 'lancar') setTimeout(() => { const i = $('#inValor'); if (i) i.focus(); }, 80);
}

/* ---------- telas de entrada ---------- */
function telaConectar() {
  mostrarMolde(false);
  $('#tela').innerHTML = `
  <div class="boasvindas">
    <img class="logo" src="icon-512.png" alt="">
    <h1>HRM Finance</h1>
    <p>Conecte o app à sua planilha para começar.</p>
    <label class="rotulo-campo" for="inUrl">Link do App da Web (Apps Script)</label>
    <input id="inUrl" class="campo" placeholder="https://script.google.com/macros/s/.../exec"
      value="${esc(S.urlSugerida)}" autocomplete="off" autocapitalize="off" spellcheck="false">
    <label class="rotulo-campo" for="inPin">PIN</label>
    <input id="inPin" class="campo" type="password" inputmode="numeric" maxlength="8" placeholder="Seu PIN" autocomplete="off">
    <button class="btn" data-acao="conectar">Conectar</button>
  </div>`;
}

function telaPin() {
  mostrarMolde(false);
  const n = Math.max(4, S.pinDig.length);
  const pontos = Array.from({ length: n }, (_, i) => `<span class="${i < S.pinDig.length ? 'on' : ''}"></span>`).join('');
  const teclas = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(t => `<button data-acao="tecla" data-t="${t}">${t}</button>`).join('');
  $('#tela').innerHTML = `
  <div class="boasvindas">
    <img class="logo" src="icon-512.png" alt="">
    <h1>Digite seu PIN</h1>
    <p>Para abrir o HRM Finance</p>
    <div class="pin-pontos" id="pontos">${pontos}</div>
    <div class="teclado">
      ${teclas}
      <button class="sem-fundo" data-acao="trocarPlanilha">Sair</button>
      <button data-acao="tecla" data-t="0">0</button>
      <button class="sem-fundo" data-acao="tecla" data-t="<" aria-label="Apagar">apagar</button>
    </div>
    <button class="btn" data-acao="entrarPin">Entrar</button>
  </div>`;
}

function telaCarregando() {
  mostrarMolde(false);
  $('#tela').innerHTML = S.erroCarga ? `
  <div class="boasvindas">
    <img class="logo" src="icon-512.png" alt="">
    <h1>Não consegui carregar</h1>
    <p>${esc(S.erroCarga)}</p>
    <button class="btn" data-acao="tentarDeNovo">Tentar de novo</button>
    <button class="btn secundario" data-acao="trocarPlanilha">Trocar planilha</button>
  </div>` : `
  <div class="carregando"><div><div class="girando"></div>Carregando seus dados…</div></div>`;
}

function telaSaldoInicial() {
  mostrarMolde(false);
  $('#tela').innerHTML = `
  <div class="boasvindas">
    <img class="logo" src="icon-512.png" alt="">
    <h1>Quanto você tem hoje?</h1>
    <p>Informe o valor disponível agora para usar (conta e dinheiro em mãos). Não inclua o que está guardado em cofrinhos: eles você cria depois, em Cofrinhos, na tela inicial.</p>
    <div class="valor-entrada"><input id="inIni" data-dinheiro inputmode="numeric" placeholder="R$ 0,00" autocomplete="off"></div>
    <button class="btn" data-acao="saldoInicialOk">Começar</button>
    <button class="btn secundario" data-acao="saldoInicialZero">Começar do zero</button>
  </div>`;
}

/* ---------- componentes ---------- */
function mesNav() {
  const atual = S.mes >= chaveMes();
  return `
  <div class="mes-nav">
    <button data-acao="mes" data-delta="-1" aria-label="Mês anterior">${icone.esq}</button>
    <strong>${esc(maiuscula(nomeMes(S.mes)))}</strong>
    <button data-acao="mes" data-delta="1" aria-label="Próximo mês" ${atual ? 'disabled' : ''}>${icone.dir}</button>
  </div>`;
}

function itemLanc(l) {
  const cor = corCat(l.tipo, l.categoria);
  const entrada = l.tipo === 'Entrada';
  const t1 = l.descricao ? esc(l.descricao) : esc(l.categoria);
  const volta = l.tipo === 'Entrada' ? 0 : (receberPorLanc(S.dados)[String(l.id)] || 0);
  const extras = [l.registro ? 'Nº ' + l.registro : '', l.descricao ? l.categoria : '', l.pagamento, hora(l.dataHora),
    volta ? fmt(volta) + ' a receber' : ''].filter(Boolean).map(esc).join(' · ');
  return `
  <button class="item" data-acao="editarLanc" data-id="${esc(l.id)}">
    <span class="ico" style="background:${cor}26;color:${cor}">${esc((l.categoria || '?').charAt(0).toUpperCase())}</span>
    <span class="meio">
      <div class="t1">${t1}${l._pendente ? '<span class="tag-pend">enviando</span>' : ''}</div>
      <div class="t2">${extras}</div>
    </span>
    <span class="val num ${entrada ? 'pos' : ''}">${entrada ? '+' : '−'}${fmt(l.valor)}</span>
  </button>`;
}

/* ---------- orçamento ---------- */
function orcamento() {
  try { const o = JSON.parse(S.dados.config.orcamento || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
}
const catsOrcaveis = () => categorias('Saída').filter(c => c.nome !== CAT_DIZIMO);
const corBarra = pct => pct > 100 ? 'var(--vermelho)' : pct >= 80 ? 'var(--amarelo)' : 'var(--verde-barra)';
/* Parte do mês já passada (só para o mês atual), para a marca de ritmo */
function ritmoDoMes(mes) {
  if (mes !== chaveMes()) return mes < chaveMes() ? 1 : 0;
  const h = new Date();
  return h.getDate() / new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate();
}
function resumoOrcamento(mes) {
  const lim = orcamento();
  const c = calcular(S.dados, mes);
  const nomes = catsOrcaveis().map(x => x.nome).filter(n => num(lim[n]) > 0);
  const limite = r2(nomes.reduce((s, n) => s + num(lim[n]), 0));
  const gasto = r2(nomes.reduce((s, n) => s + (c.porCat[n] || 0), 0));
  return { lim, nomes, limite, gasto, porCat: c.porCat };
}
function barra(gasto, limite, ritmo) {
  const pct = limite > 0 ? gasto / limite * 100 : 0;
  return `<div class="barra-orc"><div style="width:${Math.min(100, pct).toFixed(1)}%;background:${corBarra(pct)}"></div>
    ${ritmo > 0 && ritmo < 1 ? `<i style="left:${(ritmo * 100).toFixed(1)}%" title="Ritmo do mês"></i>` : ''}</div>`;
}
/* Depois de registrar um gasto: como ficou a categoria no orçamento */
function avisoOrcamento(cat, mes) {
  const lim = num(orcamento()[cat]);
  if (!(lim > 0)) return '';
  const g = calcular(S.dados, mes).porCat[cat] || 0;
  return ` · ${cat}: ${fmt(g)} de ${fmt(lim)} (${Math.round(g / lim * 100)}%)`;
}

/* ---------- compromissos ---------- */
const hojeIso = () => isoLocal().slice(0, 10);
const fimDoMes = () => { const h = new Date(); return isoLocal(new Date(h.getFullYear(), h.getMonth() + 1, 0)).slice(0, 10); };
function proximoVencimento(venc, dia) {
  const [a, m, dd] = String(venc).slice(0, 10).split('-').map(Number);
  const d = +dia || dd;
  const ultimo = new Date(a, m + 1, 0).getDate();
  return isoLocal(new Date(a, m, Math.min(d, ultimo))).slice(0, 10);
}
function compromissoPago(c, p) {
  return c.repete === 'Mensal'
    ? { ...c, vencimento: proximoVencimento(c.vencimento, c.dia), pagoEm: p.dataHora, lancamentoId: p.lancamentoId, _pendente: true }
    : { ...c, status: 'Pago', pagoEm: p.dataHora, lancamentoId: p.lancamentoId, _pendente: true };
}
const diasAte = iso => Math.round((new Date(iso + 'T12:00:00') - new Date(hojeIso() + 'T12:00:00')) / 864e5);
function quandoVence(iso) {
  const n = diasAte(iso);
  if (n < 0) return n === -1 ? 'venceu ontem' : `venceu há ${-n} dias`;
  if (n === 0) return 'vence hoje';
  if (n === 1) return 'vence amanhã';
  return n <= 7 ? `vence em ${n} dias` : 'vence em ' + dataCurta(iso + 'T12:00:00');
}
const abertos = () => S.dados.compromissos.filter(c => c.status !== 'Pago');

/* ---------- INÍCIO ---------- */
function painel() {
  const d = S.dados;
  const mes = chaveMes();
  const c = calcular(d, mes);
  const recentes = d.lancamentos.slice().sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora))).slice(0, 3);
  const primeiraVez = !d.lancamentos.length && !d.cofrinhos.length;

  const ab = d.versao >= 4 ? abertos() : [];
  const atrasados = ab.filter(x => diasAte(x.vencimento) < 0).length;
  const noMes = ab.filter(x => x.vencimento <= fimDoMes());
  const totComp = r2(noMes.reduce((s, x) => s + num(x.valor), 0));
  const detComp = d.versao < 4 ? 'atualize a planilha' : atrasados ? `${atrasados} atrasado${atrasados > 1 ? 's' : ''}`
    : noMes.length ? `${noMes.length} até o fim do mês` : ab.length ? `${ab.length} em aberto` : 'nada pendente';
  const nCof = d.cofrinhos.length;
  const recAb = d.receber.filter(r => r.status !== 'Recebido').length;
  const atalho = (cls, acao, ic, nome, valor, det, neg) => `
    <button class="atalho-b ${cls}" data-acao="${acao}">${ic}<span>
      <span class="nome">${nome}</span><span class="valor num">${fmt(valor)}</span><span class="det ${neg ? 'neg' : ''}">${det}</span></span></button>`;

  return `
  ${cabecalho(`${saudacao()}, ${NOME}`, { sobre: 'Início' })}
  <section class="heroi">
    <div class="rotulo">Na carteira</div>
    <div class="valor-grande num">${fmt(c.carteira)}</div>
    <div class="heroi-linha">
      <div><span>Entrou</span><b class="num">${fmt(c.entMes)}</b></div>
      <div><span>Saiu</span><b class="num">${fmt(c.saiMes)}</b></div>
      <div><span>Saldo total</span><b class="num">${fmt(c.total)}</b></div>
    </div>
  </section>

  <div class="atalhos">
    ${atalho('a1', 'abrirCompromissos', icone.compromisso, 'Compromissos', totComp, detComp, atrasados > 0)}
    ${atalho('a2', 'abrirCofrinhos', icone.porco, 'Cofrinhos', c.totalCofres, nCof ? `${nCof} cofrinho${nCof > 1 ? 's' : ''}` : 'criar o primeiro')}
    ${atalho('a3', 'abrirDizimos', icone.igreja, 'Fidelidade', c.reservado, c.reservado > 0 ? 'a enviar' : 'nada a enviar')}
    ${atalho('a4', 'abrirReceber', icone.receber, 'A receber', c.aReceber, recAb ? `${recAb} pendente${recAb > 1 ? 's' : ''}` : 'nada pendente')}
  </div>

  ${cardPosso()}

  ${primeiraVez ? `
  <div class="card dica">${icone.dica}<div><b>Primeiros passos</b><br>Toque no <b>+</b> para registrar um gasto ou uma entrada. Seus cofrinhos você cria tocando em <b>Cofrinhos</b>.</div></div>` : ''}

  <div class="h2-linha"><h2>Últimos lançamentos</h2>${recentes.length ? '<button class="link-btn" data-view="fluxo">Ver tudo</button>' : ''}</div>
  ${recentes.length ? `<div class="lista grupo">${recentes.map(itemLanc).join('')}</div>` : '<div class="card vazio">Nenhum lançamento ainda.</div>'}`;
}

/* "Ainda posso gastar": o que sobra dos limites do mês e as duas categorias mais perto de estourar */
function cardPosso() {
  const mes = chaveMes();
  const o = resumoOrcamento(mes);
  if (!o.nomes.length) return `
  <button class="card linha-btn" style="margin-top:14px" data-view="orcamento">
    <div><b>Ainda posso gastar</b><div class="muted pequeno">Defina quanto quer gastar por categoria na aba Orçamentos</div></div>${icone.dir}</button>`;
  const pct = o.gasto / o.limite * 100;
  const resta = r2(o.limite - o.gasto);
  const h = new Date();
  const faltam = new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate() - h.getDate();
  const cats = o.nomes.map(n => ({ n, g: o.porCat[n] || 0, l: num(o.lim[n]) }))
    .map(x => ({ ...x, p: x.g / x.l * 100 })).sort((a, b) => b.p - a.p).slice(0, 2);
  return `
  <div class="card posso">
    <div class="posso-topo">
      <div class="anel" style="background:conic-gradient(${corBarra(pct)} 0 ${Math.min(100, pct).toFixed(1)}%, var(--trilho) 0 100%)"><div><b>${Math.round(pct)}%</b><span>usado</span></div></div>
      <div>
        <div class="muted" style="font-size:13px">Ainda posso gastar</div>
        <div class="v num ${resta < 0 ? 'neg' : ''}">${resta >= 0 ? fmt(resta) : '−' + fmt(-resta)}</div>
        <div class="muted pequeno">${resta >= 0 ? 'até o fim do mês' : 'acima do limite do mês'} · ${faltam ? `faltam ${faltam} dia${faltam > 1 ? 's' : ''}` : 'último dia'}</div>
      </div>
    </div>
    <div class="linha-mini"><span>Mais perto do limite</span><button class="link-btn" data-view="orcamento">Ver todos</button></div>
    ${cats.map(x => {
      const r = r2(x.l - x.g);
      return `
    <div class="posso-cat">
      <div class="l"><span>${esc(x.n)}</span><span class="${x.p > 100 ? 'neg' : x.p >= 80 ? 'alerta-t' : 'muted'}">${r >= 0 ? `restam <b>${fmtSimples(r)}</b>` : `passou <b>${fmtSimples(-r)}</b>`}</span></div>
      <div class="trilho"><div style="width:${Math.min(100, x.p).toFixed(1)}%;background:${corBarra(x.p)}"></div></div>
    </div>`;
    }).join('')}
  </div>`;
}

/* ---------- ORÇAMENTOS ---------- */
function telaOrcamento() {
  const aba = S.abaOrc;
  const seg = `<div class="segmento">
    <button class="${aba === 'gastos' ? 'on' : ''}" data-acao="abaOrc" data-aba="gastos">Gastos</button>
    <button class="${aba === 'entradas' ? 'on' : ''}" data-acao="abaOrc" data-aba="entradas">Entradas</button></div>`;
  return `${cabecalho('Orçamentos')}${mesNav()}${seg}${aba === 'gastos' ? orcGastos() : orcEntradas()}`;
}

function orcGastos() {
  const o = resumoOrcamento(S.mes);
  const ritmo = ritmoDoMes(S.mes);
  const seta = '<svg class="seta" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
  const linha = c => {
    const n = c.nome, lim = num(o.lim[n]), g = r2(o.porCat[n] || 0);
    const p = lim > 0 ? g / lim * 100 : 0;
    const info = lim > 0 ? `${fmtSimples(g)} de ${fmtSimples(lim)}` : g > 0 ? `${fmtSimples(g)} · definir limite` : 'Sem limite · definir';
    const cls = lim > 0 ? (p > 100 ? 'estouro' : p >= 80 ? 'alerta' : '') : 'definir';
    return `
    <button class="orc-item" data-acao="catOrc" data-nome="${esc(n)}">
      <div class="topo-i"><span class="bolinha" style="background:${c.cor}"></span><b>${esc(n)}</b><span class="info ${cls}">${info}</span>${seta}</div>
      ${lim > 0 ? barra(g, lim, ritmo) : ''}
    </button>`;
  };
  const temDizimo = categorias('Saída').some(c => c.nome === CAT_DIZIMO);
  const dz = r2(o.porCat[CAT_DIZIMO] || 0);
  return `
  ${o.nomes.length ? '' : '<p class="nota" style="margin-top:0">Toque numa categoria para definir quanto quer gastar por mês.</p>'}
  <div class="card orc-lista">
    ${catsOrcaveis().map(linha).join('')}
    ${temDizimo ? `
    <div class="orc-item fora"><div class="topo-i"><span class="bolinha" style="background:${corCat('Saída', CAT_DIZIMO)}"></span><span style="flex:1;font-size:14px">${CAT_DIZIMO}</span><span class="pequeno">${dz ? fmt(dz) + ' · ' : ''}fora do orçamento</span></div></div>` : ''}
  </div>
  <button class="btn tracejado" data-acao="novaCat" data-tipo="Saída">+ Nova categoria de gasto</button>
  ${o.nomes.length ? '<p class="nota">O tracinho na barra mostra o ritmo do mês. Os limites valem para todos os meses até você mudar. O que sobra não passa para o mês seguinte. <button class="link-btn" data-acao="editarOrcamento">Editar todos os limites</button></p>' : ''}`;
}

function orcEntradas() {
  const d = S.dados;
  const somaMes = m => {
    const r = {};
    d.lancamentos.forEach(l => { if (l.tipo === 'Entrada' && String(l.dataHora).slice(0, 7) === m) r[l.categoria] = (r[l.categoria] || 0) + num(l.valor); });
    return r;
  };
  const doMes = somaMes(S.mes);
  const seta = '<svg class="seta" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
  return `
  <div class="card orc-lista">
    ${categorias('Entrada').map(c => `
    <button class="orc-item" data-acao="catEnt" data-nome="${esc(c.nome)}">
      <div class="topo-i"><span class="bolinha" style="background:${c.cor}"></span><b>${esc(c.nome)}</b><span class="info">${fmt(doMes[c.nome] || 0)}</span>${seta}</div>
    </button>`).join('') || '<div class="vazio">Nenhuma categoria de entrada.</div>'}
  </div>
  <button class="btn tracejado verde" data-acao="novaCat" data-tipo="Entrada">+ Nova categoria de entrada</button>`;
}

/* Toque numa categoria de gasto: limite do mês e exclusão */
function folhaCatOrc(nome) {
  const lim = num(orcamento()[nome]);
  const g = calcular(S.dados, S.mes).porCat[nome] || 0;
  const mAnt = mudaMes(S.mes, -1);
  const ant = calcular(S.dados, mAnt).porCat[nome] || 0;
  const v = Math.round(lim * 100);
  abrirFolha(`
    <h3><span class="bolinha" style="background:${corCat('Saída', nome)};margin-right:6px"></span>${esc(nome)}</h3>
    <p class="muted pequeno">Em ${esc(nomeMes(S.mes, false))}: <b>${fmt(g)}</b> · em ${esc(nomeMes(mAnt, false))}: ${fmt(ant)}</p>
    <label class="rotulo-campo" for="inLimCat">Limite por mês</label>
    <input id="inLimCat" class="campo" data-dinheiro inputmode="numeric" placeholder="Sem limite" autocomplete="off" data-centavos="${v}" value="${v ? fmt(v / 100) : ''}">
    <p class="muted pequeno">Vale para todos os meses até você mudar. Deixe em branco para não limitar.</p>
    <button class="btn" data-acao="salvarLimCat" data-nome="${esc(nome)}">Salvar limite</button>
    <button class="btn perigo" data-acao="delCat" data-tipo="Saída" data-nome="${esc(nome)}">Excluir categoria</button>
    <button class="btn secundario" data-acao="fecharFolha">Cancelar</button>`, () => $('#inLimCat').focus());
}

function folhaCatEnt(nome) {
  const tot = S.dados.lancamentos.filter(l => l.tipo === 'Entrada' && l.categoria === nome && String(l.dataHora).slice(0, 7) === S.mes)
    .reduce((s, l) => s + num(l.valor), 0);
  abrirFolha(`
    <h3><span class="bolinha" style="background:${corCat('Entrada', nome)};margin-right:6px"></span>${esc(nome)}</h3>
    <p class="muted pequeno">Em ${esc(nomeMes(S.mes, false))}: <b>${fmt(tot)}</b></p>
    <button class="btn perigo" data-acao="delCat" data-tipo="Entrada" data-nome="${esc(nome)}">Excluir categoria</button>
    <button class="btn secundario" data-acao="fecharFolha">Fechar</button>`);
}

function folhaOrcamento() {
  const lim = orcamento();
  const ant = calcular(S.dados, mudaMes(chaveMes(), -1)).porCat;
  abrirFolha(`
    <h3>Limites por mês</h3>
    <p class="muted pequeno">Valem para todos os meses até você mudar. Deixe em branco a categoria que não quer limitar. Dízimos e ofertas ficam fora do orçamento.</p>
    ${catsOrcaveis().map(c => {
      const v = Math.round(num(lim[c.nome]) * 100);
      return `
    <div class="orc-campo">
      <label for="lim-${esc(c.nome)}"><span class="bolinha" style="background:${c.cor}"></span>${esc(c.nome)}
        ${ant[c.nome] ? `<div class="muted pequeno">mês passado: ${fmt(ant[c.nome])}</div>` : ''}</label>
      <input id="lim-${esc(c.nome)}" class="campo" data-limite="${esc(c.nome)}" data-dinheiro inputmode="numeric" autocomplete="off"
        placeholder="Sem limite" data-centavos="${v}" value="${v ? fmt(v / 100) : ''}">
    </div>`;
    }).join('')}
    <button class="btn" data-acao="salvarOrcamento">Salvar limites</button>
    <button class="btn secundario" data-acao="fecharFolha">Cancelar</button>`);
}

/* ---------- FLUXO DE CAIXA ---------- */
/* Tudo o que entra e sai da carteira, em ordem, com o saldo depois de cada movimento */
function eventosCarteira(d) {
  const ev = [];
  const nomeCofre = id => (d.cofrinhos.find(c => String(c.id) === String(id)) || {}).nome || 'cofrinho';
  for (const l of d.lancamentos) ev.push({ quando: String(l.dataHora), tipo: 'lanc', l, v: l.tipo === 'Entrada' ? num(l.valor) : -num(l.valor) });
  for (const m of d.movimentos) {
    if (m.tipo === 'Guardar' || m.tipo === 'Resgatar') ev.push({ quando: String(m.dataHora), tipo: 'mov', m, nome: nomeCofre(m.cofrinhoId), v: m.tipo === 'Guardar' ? -num(m.valor) : num(m.valor) });
  }
  for (const r of d.receber) if (r.status === 'Recebido') ev.push({ quando: String(r.atualizadoEm || r.dataHora), tipo: 'rec', r, v: num(r.valor) });
  ev.sort((a, b) => a.quando.localeCompare(b.quando));
  let s = num(d.config.saldoInicial);
  for (const e of ev) { s = r2(s + e.v); e.saldo = s; }
  return ev;
}
/* Saldo da carteira antes de um mês começar */
function saldoAntes(ev, mes, ini) {
  let s = ini;
  for (const e of ev) { if (e.quando.slice(0, 7) >= mes) break; s = e.saldo; }
  return s;
}

const textoEvento = e => normalizar(e.tipo === 'lanc' ? `${e.l.descricao} ${e.l.categoria} ${e.l.registro || ''}`
  : e.tipo === 'mov' ? `${e.nome} cofrinho ${e.m.tipo === 'Guardar' ? 'guardado' : 'resgatado'}` : `${e.r.devedor} recebido`);

function itemEvento(e) {
  if (e.tipo === 'lanc') return itemLanc(e.l);
  if (e.tipo === 'mov') return `
  <button class="item cinza" data-acao="abrirCofrinhos">
    <span class="ico ico-cinza">${icone.porco}</span>
    <span class="meio"><div class="t1">${e.m.tipo === 'Guardar' ? 'Guardado em' : 'Resgatado de'} ${esc(e.nome)}</div><div class="t2">Cofrinho · ${hora(e.quando)}</div></span>
    <span class="val num">${e.v < 0 ? '−' : '+'}${fmt(Math.abs(e.v))}</span></button>`;
  const l = S.dados.lancamentos.find(x => String(x.id) === String(e.r.lancamentoId));
  return `
  <button class="item cinza" data-acao="itemReceber" data-id="${esc(e.r.id)}">
    <span class="ico ico-cinza">${icone.receber}</span>
    <span class="meio"><div class="t1">Recebido ${e.r.devedor === 'Igreja' ? 'da igreja' : 'de ' + esc(e.r.devedor)}</div><div class="t2">${l ? esc(l.descricao || l.categoria) + ' · ' : ''}${hora(e.quando)}</div></span>
    <span class="val num">+${fmt(e.v)}</span></button>`;
}

function listaFluxo() {
  const ev = eventosCarteira(S.dados);
  const doMes = ev.filter(e => e.quando.slice(0, 7) === S.mes);
  const fimDia = {};
  doMes.forEach(e => { fimDia[e.quando.slice(0, 10)] = e.saldo; });
  const f = S.filtro, q = normalizar(S.busca);
  let lista = doMes;
  if (f === 'tipo:Entrada' || f === 'tipo:Saída') lista = lista.filter(e => e.tipo === 'lanc' && e.l.tipo === f.slice(5));
  else if (f === 'cofre') lista = lista.filter(e => e.tipo === 'mov');
  else if (f.startsWith('cat:')) lista = lista.filter(e => e.tipo === 'lanc' && e.l.tipo + '|' + e.l.categoria === f.slice(4));
  if (q) lista = lista.filter(e => textoEvento(e).includes(q));
  lista = lista.slice().reverse();
  if (!lista.length) return `<div class="card vazio" style="margin-top:14px">${q || f !== 'todos' ? 'Nada encontrado com esse filtro.' : 'Nada por aqui neste mês.'}</div>`;
  let html = '', dia = '';
  for (const e of lista) {
    const d = e.quando.slice(0, 10);
    if (d !== dia) {
      if (dia) html += '</div>';
      html += `<div class="dia"><span>${esc(rotuloDia(d))}</span><span>saldo ${fmt(fimDia[d])}</span></div><div class="lista grupo">`;
      dia = d;
    }
    html += itemEvento(e);
  }
  return html + '</div>';
}

function fluxo() {
  const d = S.dados;
  const rec = receberPorLanc(d);
  let ent = 0, sai = 0;
  const doMes = d.lancamentos.filter(l => String(l.dataHora).slice(0, 7) === S.mes);
  doMes.forEach(l => { if (l.tipo === 'Entrada') ent += num(l.valor); else sai += Math.max(gastoLiquido(l, rec), 0); });
  ent = r2(ent); sai = r2(sai);
  const catsDoMes = [...new Set(doMes.map(l => l.tipo + '|' + l.categoria))];
  const temMov = d.movimentos.some(m => (m.tipo === 'Guardar' || m.tipo === 'Resgatar') && String(m.dataHora).slice(0, 7) === S.mes);
  const chip = (val, rotulo, cor) =>
    `<button class="chip pequeno ${S.filtro === val ? 'on' : ''}" data-acao="filtro" data-f="${esc(val)}">${cor ? `<span class="bolinha" style="background:${cor}"></span>` : ''}${esc(rotulo)}</button>`;

  let previsto = '';
  if (S.mes === chaveMes() && d.versao >= 4) {
    const ab = abertos().filter(c => c.vencimento <= fimDoMes()).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const tot = r2(ab.reduce((s, c) => s + num(c.valor), 0));
    const cart = calcular(d, S.mes).carteira;
    previsto = `
  <h2>Previsto até o fim do mês</h2>
  <div class="card bancos previsto">
    <div class="banco"><span>Na carteira hoje</span><b class="num">${fmt(cart)}</b></div>
    ${ab.slice(0, 4).map(c => `<div class="banco"><span class="muted">${esc(c.descricao)} · ${quandoVence(c.vencimento)}</span><b class="num ${c.valor ? 'neg' : 'muted'}">${c.valor ? '−' + fmt(c.valor) : '—'}</b></div>`).join('')}
    ${ab.length > 4 ? `<div class="banco muted pequeno"><span>e mais ${ab.length - 4} compromisso${ab.length - 4 > 1 ? 's' : ''}</span></div>` : ''}
    ${!ab.length ? '<div class="banco muted pequeno"><span>Nenhum compromisso até o fim do mês</span></div>' : ''}
    <div class="banco total-linha"><span><b>Depois de pagar tudo</b></span><b class="num ${cart - tot < 0 ? 'neg' : ''}">${fmt(r2(cart - tot))}</b></div>
    <button class="link-btn" data-acao="abrirCompromissos" style="text-align:left;padding-top:4px">Ver compromissos ›</button>
  </div>`;
  }

  return `
  ${cabecalho('Fluxo de caixa')}
  ${mesNav()}
  <div class="card trio">
    <div><span>Entrou</span><b class="num pos">${fmt(ent)}</b></div>
    <div><span>Saiu</span><b class="num">${fmt(sai)}</b></div>
    <div><span>Sobrou</span><b class="num ${ent - sai < 0 ? 'neg' : ''}">${sinal(r2(ent - sai))}</b></div>
  </div>
  ${previsto}
  <h2>Extrato</h2>
  <div class="filtros">
    ${chip('todos', 'Todos')}${chip('tipo:Saída', 'Saídas')}${chip('tipo:Entrada', 'Entradas')}${temMov ? chip('cofre', 'Cofrinhos') : ''}
    ${catsDoMes.map(k => { const [t, n] = k.split('|'); return chip('cat:' + k, n, corCat(t, n)); }).join('')}
  </div>
  <div class="busca">${icone.busca}<input id="inBusca" class="campo" type="search" placeholder="Buscar no mês" value="${esc(S.busca)}" autocomplete="off"></div>
  <div id="fluxoLista">${listaFluxo()}</div>`;
}

/* ---------- ANÁLISE ---------- */
const PERIODOS = { mes: ['Mês', 1], tri: ['Trimestre', 3], sem: ['Semestre', 6], ano: ['Ano', 12] };
const mesesEntre = (a, b) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma) + 1; };
function rotuloPeriodo(ini, fim) {
  const curto = k => nomeMes(k, false).slice(0, 3);
  if (ini === fim) return `${maiuscula(nomeMes(ini, false))} de ${ini.slice(0, 4)}`;
  if (ini.slice(5) === '01' && fim.slice(5) === '12' && ini.slice(0, 4) === fim.slice(0, 4)) return ini.slice(0, 4);
  return ini.slice(0, 4) === fim.slice(0, 4) ? `${maiuscula(curto(ini))} a ${curto(fim)} de ${fim.slice(0, 4)}`
    : `${maiuscula(curto(ini))}/${ini.slice(0, 4)} a ${curto(fim)}/${fim.slice(0, 4)}`;
}
function periodo(per, ref) {
  if (per === 'ano') {
    const a = ref.slice(0, 4), atual = a === chaveMes().slice(0, 4);
    return { ini: `${a}-01`, fim: atual ? chaveMes() : `${a}-12`, rotulo: atual ? `${a} até agora` : a };
  }
  const ini = mudaMes(ref, -(PERIODOS[per][1] - 1));
  return { ini, fim: ref, rotulo: rotuloPeriodo(ini, ref) };
}
function periodoComparar(p, per, cmp) {
  const q = cmp === 'ano' || per === 'ano' ? { ini: mudaMes(p.ini, -12), fim: mudaMes(p.fim, -12) }
    : { ini: mudaMes(p.ini, -mesesEntre(p.ini, p.fim)), fim: mudaMes(p.ini, -1) };
  q.rotulo = per === 'mes' && cmp !== 'ano' ? nomeMes(q.ini, false) : rotuloPeriodo(q.ini, q.fim);
  q.frase = /^\d/.test(q.rotulo) ? q.rotulo : q.rotulo.charAt(0).toLowerCase() + q.rotulo.slice(1);
  return q;
}

/* Números de um período (meses "AAAA-MM", inclusive) */
function analisar(d, ini, fim) {
  const rec = receberPorLanc(d);
  const dentro = s => { const k = String(s).slice(0, 7); return k >= ini && k <= fim; };
  let ent = 0, gastei = 0, igreja = 0;
  const porCat = {}, porCatEnt = {}, gastos = [];
  for (const l of d.lancamentos) {
    if (!dentro(l.dataHora)) continue;
    if (l.tipo === 'Entrada') { ent += num(l.valor); porCatEnt[l.categoria] = (porCatEnt[l.categoria] || 0) + num(l.valor); continue; }
    const v = gastoLiquido(l, rec);
    if (v <= 0) continue;
    if (l.categoria === CAT_DIZIMO) { igreja += v; continue; }
    gastei += v; porCat[l.categoria] = (porCat[l.categoria] || 0) + v; gastos.push({ l, v });
  }
  // Conta só os meses em que o app já era usado, até o mês atual
  const primeiro = d.lancamentos.reduce((m, l) => { const k = String(l.dataHora).slice(0, 7); return !m || k < m ? k : m; }, '');
  const iniEf = primeiro && primeiro > ini ? primeiro : ini;
  const fimEf = fim > chaveMes() ? chaveMes() : fim;
  const meses = iniEf <= fimEf ? mesesEntre(iniEf, fimEf) : 1;
  ent = r2(ent); gastei = r2(gastei); igreja = r2(igreja);
  return { ini, fim, ent, gastei, igreja, sobrou: r2(ent - gastei - igreja), porCat, porCatEnt,
    top: gastos.sort((a, b) => b.v - a.v).slice(0, 5), meses, iniEf, cortado: iniEf > ini,
    temDados: d.lancamentos.some(l => dentro(l.dataHora)) };
}
const taxaPoupanca = a => a.ent > 0 ? Math.round(a.sobrou / a.ent * 100) : null;

/* Diferença em R$ (com % só quando ajuda) entre o período e o de comparação */
function variacao(v, a, temDados) {
  if (!temDados) return { t: '—', c: '' };
  if (!a) return { t: 'novo gasto', c: 'neg' };
  if (Math.abs(v - a) < 1) return { t: 'igual', c: '' };
  return v > a ? { t: '+' + fmtSimples(v - a), c: 'neg' } : { t: '−' + fmtSimples(a - v), c: 'pos' };
}
function frasesComparacao(a, b) {
  const dif = (x, y, mais, menos) => Math.abs(x - y) < 1 ? 'o mesmo' : `${fmtSimples(Math.abs(x - y))} ${x > y ? mais : menos}`;
  return `gastou ${dif(a.gastei, b.gastei, 'a mais', 'a menos')} (${fmtSimples(b.gastei)} antes), entrou ${dif(a.ent, b.ent, 'a mais', 'a menos')} e sobrou ${dif(a.sobrou, b.sobrou, 'a mais', 'a menos')}.`;
}

/* Gasto médio dos últimos três meses fechados (ou do mês atual, se ainda não houver) */
function gastoMedio(d) {
  const a = analisar(d, mudaMes(chaveMes(), -3), mudaMes(chaveMes(), -1));
  if (a.temDados && a.gastei > 0) return { v: r2(a.gastei / a.meses), base: 'dos últimos meses' };
  const b = analisar(d, chaveMes(), chaveMes());
  return { v: b.gastei, base: 'deste mês' };
}
function reserva(d) {
  const cofres = calcular(d, chaveMes()).totalCofres;
  const g = gastoMedio(d);
  return { cofres, medio: g.v, base: g.base, meses: g.v > 0 ? cofres / g.v : null };
}
const fixosMensais = d => r2(d.compromissos.filter(c => c.repete === 'Mensal').reduce((s, c) => s + num(c.valor), 0));

function svgRosca(lista, total, tam = 112) {
  const R = 44, C = 2 * Math.PI * R, gap = lista.length > 1 ? 1.6 : 0;
  let acc = 0;
  const segs = lista.map(i => {
    const fat = i.v / total * C, len = Math.max(fat - gap, 0.6);
    const s = `<circle cx="56" cy="56" r="${R}" stroke="${i.cor}" stroke-width="16" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 56 56)"/>`;
    acc += fat;
    return s;
  }).join('');
  return `<svg class="rosca" viewBox="0 0 112 112" style="width:${tam}px;height:${tam}px" aria-hidden="true">
    <circle cx="56" cy="56" r="${R}" style="stroke:var(--trilho)" stroke-width="16"/>${segs}
    <text x="56" y="52" text-anchor="middle" style="fill:var(--suave)" stroke="none" font-size="9" font-weight="600">Gastei</text>
    <text x="56" y="67" text-anchor="middle" style="fill:var(--texto)" stroke="none" font-size="${fmtCurto(total).length > 11 ? 10 : 12}" font-weight="800">${esc(fmtCurto(total))}</text></svg>`;
}
function fatias(porCat) {
  const itens = Object.entries(porCat).map(([nome, v]) => ({ nome, v, cor: corCat('Saída', nome) })).sort((a, b) => b.v - a.v);
  if (itens.length <= 6) return itens;
  return [...itens.slice(0, 5), { nome: 'Outras', v: itens.slice(5).reduce((s, i) => s + i.v, 0), cor: '#8A95A8', outras: itens.slice(5).map(i => i.nome) }];
}

function analise() {
  const d = S.dados;
  const per = S.per, cmp = per === 'ano' ? 'ano' : S.cmp;
  const p = periodo(per, S.refAn);
  const q = periodoComparar(p, per, cmp);
  const a = analisar(d, p.ini, p.fim), b = analisar(d, q.ini, q.fim);
  const passo = PERIODOS[per][1];
  const noFim = mudaMes(S.refAn, passo) > chaveMes() || (per === 'ano' && S.refAn.slice(0, 4) === chaveMes().slice(0, 4));
  const taxa = taxaPoupanca(a);
  const emAndamento = p.fim >= chaveMes();

  // 1 · Resumo
  const cmpTxt = !b.temDados ? `Comparado com ${q.frase}: sem lançamentos nesse período para comparar.`
    : `Comparado com ${q.frase}: ${frasesComparacao(a, b)}${emAndamento ? ' O período atual ainda não terminou.' : ''}`;
  const resumo = `
  <div class="bloco-t">Resumo</div>
  <div class="card">
    <div class="trio">
      <div><span>Entrou</span><b class="num pos">${fmtSimples(a.ent)}</b></div>
      <div><span>Gastei</span><b class="num">${fmtSimples(a.gastei)}</b></div>
      <div><span>Sobrou</span><b class="num ${a.sobrou < 0 ? 'neg' : ''}">${a.sobrou < 0 ? '−' : ''}${fmtSimples(Math.abs(a.sobrou))}</b></div>
    </div>
    ${taxa !== null ? `
    <div class="taxa ${taxa < 0 ? 'ruim' : ''}"><b>${taxa}%</b><span>${taxa < 0 ? 'Gastou mais do que entrou neste período.' : 'do que entrou ficou com você. Acima de 20% já é considerado bom.'}</span></div>` : ''}
    <p class="nota">${a.igreja ? `Dízimos e ofertas (${fmtSimples(a.igreja)}) já estão descontados do que sobrou. ` : ''}${cmpTxt}${a.cortado ? ` O app tem lançamentos desde ${nomeMes(a.iniEf)}; o período conta a partir daí.` : ''}</p>
  </div>`;

  // 2 · Para onde foi o dinheiro
  const lista = fatias(a.porCat);
  const bPorCat = b.porCat;
  const para = `
  <div class="bloco-t">Para onde foi o dinheiro</div>
  <div class="card">
    ${a.gastei > 0 ? `
    <div class="grafico">
      ${svgRosca(lista, a.gastei)}
      <div class="legenda">${lista.map(i => {
        const ant = i.outras ? i.outras.reduce((s, n) => s + (bPorCat[n] || 0), 0) : (bPorCat[i.nome] || 0);
        const va = variacao(i.v, ant, b.temDados);
        return `<div><span class="bolinha" style="background:${i.cor}"></span><span class="nome">${esc(i.nome)}</span>
          <span class="dir"><b class="num">${fmtSimples(i.v)}</b><span>${Math.round(i.v / a.gastei * 100)}% · <b class="${va.c}">${va.t}</b></span></span></div>`;
      }).join('')}</div>
    </div>
    <div class="secao" style="margin-top:16px">Maiores gastos</div>
    ${a.top.map((g, i) => `<div class="top-g"><span class="n">${i + 1}</span><span class="d">${esc(g.l.descricao || g.l.categoria)} <span>· ${esc(g.l.descricao ? g.l.categoria : dataCurta(g.l.dataHora))}</span></span><b class="num">${fmtSimples(g.v)}</b></div>`).join('')}
    ${b.temDados ? `<p class="nota">A variação é em relação a ${esc(q.frase)}. Em vermelho, gastou mais; em verde, gastou menos.</p>` : ''}`
    : '<div class="vazio">Nenhum gasto neste período.</div>'}
  </div>`;

  // 3 · Fixos x variáveis
  const fixos = fixosMensais(d);
  const medioPer = a.gastei / a.meses;
  let fixVar;
  if (!fixos) fixVar = `<div class="card dica" style="margin-top:0">${icone.dica}<div>Marque suas contas fixas (aluguel, luz, internet) como <b>Repete todo mês</b> em <button class="link-btn" data-acao="abrirCompromissos">Compromissos</button> para ver seu <b>custo de vida mínimo</b>.</div></div>`;
  else {
    const vari = Math.max(0, r2(medioPer - fixos));
    const tot = fixos + vari, pf = Math.round(fixos / tot * 100);
    fixVar = `
  <div class="card">
    <div class="divide"><span style="width:${pf}%;background:var(--fixos)"></span><span style="width:${100 - pf}%;background:var(--variaveis)"></span></div>
    <div class="duas">
      <div><span class="r"><i style="background:var(--fixos)"></i>Fixos · ${pf}%</span><b class="num">${fmtSimples(fixos)}/mês</b><span class="s">contas que repetem todo mês</span></div>
      <div><span class="r"><i style="background:var(--variaveis)"></i>Variáveis · ${100 - pf}%</span><b class="num">${fmtSimples(vari)}/mês</b><span class="s">o resto dos gastos, em média</span></div>
    </div>
    <p class="nota">Seu <b>custo de vida mínimo</b> é ${fmtSimples(fixos)} por mês. É nos variáveis que dá para economizar.</p>
  </div>`;
  }

  // 4 · Reserva de emergência
  const rs = reserva(d);
  let res;
  if (rs.meses === null) res = '<div class="card vazio">Ainda não há gastos para calcular.</div>';
  else {
    const m = rs.meses, cor = m < 1 ? 'var(--vermelho)' : m < 3 ? 'var(--amarelo)' : 'var(--verde-barra)';
    const falta = m < 3 ? `Faltam <b>${fmtSimples(r2(rs.medio * 3 - rs.cofres))}</b> para chegar a 3 meses.`
      : m < 6 ? `Já passou de 3 meses. Para chegar ao ideal de 6, faltam <b>${fmtSimples(r2(rs.medio * 6 - rs.cofres))}</b>.` : 'Você já tem mais de 6 meses guardados. Ótimo!';
    res = `
  <div class="card">
    <div style="display:flex;align-items:baseline;gap:8px"><b style="font-size:24px">${m.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${m >= 0.95 && m < 1.05 ? 'mês' : 'meses'}</b><span class="muted pequeno">de segurança</span></div>
    <div class="reserva-barra"><div style="width:${Math.min(100, m / 6 * 100).toFixed(1)}%;background:${cor}"></div><i style="left:50%"></i><i style="left:calc(100% - 2px)"></i></div>
    <div class="reserva-escala"><span style="left:0">0</span><span style="left:50%">3 meses</span><span style="left:100%">6 meses</span></div>
    <p class="nota">${fmtSimples(rs.cofres)} nos cofrinhos ÷ ${fmtSimples(rs.medio)} de gasto médio por mês (${rs.base}). ${falta}</p>
  </div>`;
  }

  return `
  ${cabecalho('Análise', { extra: `<button class="btn-pilula" data-acao="pdf" aria-label="Gerar relatório em PDF">${icone.pdf}PDF</button>` })}
  <div class="segmento">${Object.entries(PERIODOS).map(([k, [nome]]) => `<button class="${per === k ? 'on' : ''}" data-acao="per" data-per="${k}">${nome}</button>`).join('')}</div>
  <div class="periodo-linha">
    <div class="mes-nav">
      <button data-acao="refAn" data-delta="-1" aria-label="Período anterior">${icone.esq}</button>
      <strong>${esc(p.rotulo)}</strong>
      <button data-acao="refAn" data-delta="1" aria-label="Próximo período" ${noFim ? 'disabled' : ''}>${icone.dir}</button>
    </div>
  </div>
  <div class="cmp">${per === 'ano' ? '<button class="on">vs ano passado</button>' : `
    <button class="${cmp === 'ant' ? 'on' : ''}" data-acao="cmp" data-cmp="ant">vs anterior</button>
    <button class="${cmp === 'ano' ? 'on' : ''}" data-acao="cmp" data-cmp="ano">vs ano passado</button>`}</div>
  ${resumo}
  ${para}
  <div class="bloco-t">Fixos x variáveis</div>
  ${fixVar}
  <div class="bloco-t">Reserva de emergência</div>
  ${res}`;
}

/* ---------- RELATÓRIO EM PDF ---------- */
function relatorio() {
  const d = S.dados;
  const per = S.per, cmp = per === 'ano' ? 'ano' : S.cmp;
  const p = periodo(per, S.refAn), q = periodoComparar(p, per, cmp);
  const a = analisar(d, p.ini, p.fim), b = analisar(d, q.ini, q.fim);
  const hoje = calcular(d, chaveMes());
  const agora = new Date();
  const gerado = `${agora.toLocaleDateString('pt-BR')} às ${pad(agora.getHours())}:${pad(agora.getMinutes())}`;
  const rec = receberPorLanc(d);
  const dentro = s => { const k = String(s).slice(0, 7); return k >= p.ini && k <= p.fim; };
  const cls = v => v < -0.004 ? 'rel-neg' : '';
  const cab = titulo => `
    <div class="rel-cab">
      <div class="marca"><img src="icon-192.png" alt="">HRM Finance</div>
      <div class="dir"><b>${titulo}</b>${esc(p.rotulo)} · gerado em ${gerado}</div>
    </div>`;
  const kpi = (r, v, forte) => `<div class="${forte ? 'forte' : ''}"><span>${r}</span><b class="${forte ? '' : cls(v)}">${fmt(v)}</b></div>`;
  const taxa = taxaPoupanca(a), taxaB = taxaPoupanca(b);

  // Página 1: quanto tenho, resumo, comparação e como a carteira mudou
  const ev = eventosCarteira(d);
  const ini = num(d.config.saldoInicial);
  const saldoIni = saldoAntes(ev, p.ini, ini);
  const doPer = ev.filter(e => dentro(e.quando));
  const saldoFim = doPer.length ? doPer[doPer.length - 1].saldo : saldoIni;
  let entradas = 0, sua = 0, igreja = 0, aRec = 0, guard = 0, resg = 0, recebido = 0;
  for (const e of doPer) {
    if (e.tipo === 'lanc') {
      if (e.l.tipo === 'Entrada') entradas += num(e.l.valor);
      else {
        const liq = gastoLiquido(e.l, rec);
        if (e.l.categoria === CAT_DIZIMO) igreja += liq; else sua += liq;
        aRec += r2(num(e.l.valor) - liq);
      }
    } else if (e.tipo === 'mov') { if (e.v < 0) guard -= e.v; else resg += e.v; }
    else recebido += e.v;
  }
  const linhaRec = (txt, v, sinalTxt) => `<tr><td>${sinalTxt} ${txt}</td><td class="n ${sinalTxt === '−' && v ? 'rel-neg' : ''}">${sinalTxt === '−' && v ? '−' : ''}${fmt(v)}</td></tr>`;
  const cmpLinha = (txt, x, y, pct) => {
    const df = x - y;
    return `<tr><td>${txt}</td><td class="n">${pct ? (x === null ? '—' : x + '%') : fmt(x)}</td><td class="n">${!b.temDados ? '—' : pct ? (y === null ? '—' : y + '%') : fmt(y)}</td>
      <td class="n">${!b.temDados || (pct && (x === null || y === null)) ? '—' : pct ? (df > 0 ? '+' : '') + df + ' p.p.' : (df > 0.004 ? '+' : df < -0.004 ? '−' : '') + fmt(Math.abs(df))}</td></tr>`;
  };
  const fimRotulo = p.fim >= chaveMes() ? 'hoje' : `no fim de ${nomeMes(p.fim)}`;
  const pag1 = `
  <section class="rel-pag">
    ${cab('Relatório financeiro')}
    <h2>Quanto eu tenho hoje</h2>
    <div class="rel-kpis">${kpi('Na carteira', hoje.carteira)}${kpi('Cofrinhos', hoje.totalCofres)}${kpi('A receber', hoje.aReceber)}${kpi('Saldo total', hoje.total, true)}</div>
    ${hoje.reservado > 0 ? `<p class="rel-nota">Fora do saldo total: ${fmt(hoje.reservado)} separado para a igreja (dízimo ${fmt(hoje.dizimoRes)} e oferta ${fmt(hoje.ofertaRes)}), ainda não enviado.</p>` : ''}

    <h2>Resumo do período · ${esc(p.rotulo)}</h2>
    <div class="rel-kpis">${kpi('Entrou', a.ent)}${kpi('Gastei', a.gastei)}${kpi('Dízimos e ofertas', a.igreja)}${kpi('Sobrou', a.sobrou, true)}</div>
    <p class="rel-nota">${taxa !== null ? `Taxa de poupança: <b>${taxa}%</b> do que entrou ficou com você (acima de 20% já é considerado bom). ` : ''}Gastos já descontam o que vai voltar (reembolsos e valores divididos).</p>

    <h3>Comparação com ${esc(q.rotulo)}</h3>
    <table class="rel-tab">
      <thead><tr><th>Item</th><th class="n">${esc(p.rotulo)}</th><th class="n">${esc(q.rotulo)}</th><th class="n">Diferença</th></tr></thead>
      <tbody>${cmpLinha('Entrou', a.ent, b.ent)}${cmpLinha('Gastei', a.gastei, b.gastei)}${cmpLinha('Dízimos e ofertas', a.igreja, b.igreja)}${cmpLinha('Sobrou', a.sobrou, b.sobrou)}${cmpLinha('Taxa de poupança', taxa, taxaB, true)}</tbody>
    </table>
    ${!b.temDados ? '<p class="rel-nota">Sem lançamentos no período de comparação.</p>' : ''}

    <h2>Como a carteira mudou</h2>
    <table class="rel-tab">
      <tbody>
        <tr class="sub"><td>Saldo da carteira no início do período</td><td class="n">${fmt(saldoIni)}</td></tr>
        ${linhaRec('Entradas', r2(entradas), '+')}
        ${linhaRec('Gastos (sua parte)', r2(sua), '−')}
        ${linhaRec('Dízimos e ofertas separados', r2(igreja), '−')}
        ${linhaRec('Pago por você e a receber de volta', r2(aRec), '−')}
        ${linhaRec('Guardado nos cofrinhos', r2(guard), '−')}
        ${linhaRec('Resgatado dos cofrinhos', r2(resg), '+')}
        ${linhaRec('Recebido de volta', r2(recebido), '+')}
      </tbody>
      <tfoot><tr><td>= Saldo da carteira ${fimRotulo}</td><td class="n">${fmt(saldoFim)}</td></tr></tfoot>
    </table>
  </section>`;

  // Página 2: análise
  const lim = orcamento();
  const cats = Object.entries(a.porCat).sort((x, y) => y[1] - x[1]);
  const limiteDe = n => num(lim[n]) > 0 ? num(lim[n]) * mesesEntre(a.iniEf, p.fim > chaveMes() ? chaveMes() : p.fim) : 0;
  const fixos = fixosMensais(d);
  const rs = reserva(d);
  const cofres = d.cofrinhos.map(cf => ({ cf, s: r2(hoje.saldoCofre[String(cf.id)] || 0) }));
  const entCats = Object.entries(a.porCatEnt).sort((x, y) => y[1] - x[1]);
  const pag2 = `
  <section class="rel-pag">
    ${cab('Análise')}
    <h2>Gastos por categoria</h2>
    ${cats.length ? `<table class="rel-tab">
      <thead><tr><th>Categoria</th><th class="n">Valor</th><th class="n">% do total</th><th class="n">Limite</th><th class="n">Uso</th><th class="n">vs ${esc(q.rotulo)}</th></tr></thead>
      <tbody>${cats.map(([n, v]) => {
        const l = limiteDe(n), va = variacao(v, b.porCat[n] || 0, b.temDados);
        return `<tr><td><span class="bolinha" style="background:${corCat('Saída', n)};margin-right:6px"></span>${esc(n)}</td><td class="n">${fmt(v)}</td><td class="n">${Math.round(v / a.gastei * 100)}%</td>
          <td class="n">${l ? fmt(l) : '—'}</td><td class="n ${l && v > l ? 'rel-neg' : ''}">${l ? Math.round(v / l * 100) + '%' : '—'}</td><td class="n ${va.c === 'neg' ? 'rel-neg' : va.c === 'pos' ? 'rel-pos' : ''}">${va.t}</td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="n">${fmt(a.gastei)}</td><td class="n">100%</td><td></td><td></td><td class="n">${b.temDados ? variacao(a.gastei, b.gastei, true).t : '—'}</td></tr></tfoot>
    </table>
    <p class="rel-nota">Dízimos e ofertas (${fmt(a.igreja)}) ficam fora desta tabela. O limite é o do orçamento mensal multiplicado pelos meses do período.</p>` : '<p class="rel-nota">Nenhum gasto no período.</p>'}

    <h2>Maiores gastos</h2>
    ${a.top.length ? `<table class="rel-tab">
      <thead><tr><th>#</th><th>Data</th><th>Descrição</th><th>Categoria</th><th class="n">Valor</th></tr></thead>
      <tbody>${a.top.map((g, i) => `<tr><td>${i + 1}</td><td>${paraData(g.l.dataHora).toLocaleDateString('pt-BR')}</td><td>${esc(g.l.descricao || '—')}</td><td>${esc(g.l.categoria)}</td><td class="n">${fmt(g.v)}</td></tr>`).join('')}</tbody>
    </table>` : '<p class="rel-nota">Nenhum gasto no período.</p>'}

    <div class="rel-duas">
      <div>
        <h2>Fixos x variáveis</h2>
        ${fixos ? `<table class="rel-tab"><tbody>
          <tr><td>Fixos (contas que repetem todo mês)</td><td class="n">${fmt(fixos)}/mês</td></tr>
          <tr><td>Variáveis (média do período)</td><td class="n">${fmt(Math.max(0, r2(a.gastei / a.meses - fixos)))}/mês</td></tr>
        </tbody></table>
        <p class="rel-nota">Custo de vida mínimo: ${fmt(fixos)} por mês.</p>` : '<p class="rel-nota">Nenhum compromisso marcado como "Repete todo mês".</p>'}
      </div>
      <div>
        <h2>Reserva de emergência</h2>
        ${rs.meses === null ? '<p class="rel-nota">Ainda não há gastos para calcular.</p>' : `<table class="rel-tab"><tbody>
          <tr><td>Nos cofrinhos</td><td class="n">${fmt(rs.cofres)}</td></tr>
          <tr><td>Gasto médio por mês</td><td class="n">${fmt(rs.medio)}</td></tr>
        </tbody><tfoot><tr><td>Meses de segurança</td><td class="n">${rs.meses.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td></tr></tfoot></table>
        <p class="rel-nota">O recomendado é ter de 3 a 6 meses de gastos guardados.</p>`}
      </div>
    </div>

    ${entCats.length ? `<h2>Entradas por categoria</h2>
    <table class="rel-tab"><tbody>${entCats.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="n">${fmt(v)}</td><td class="n">${Math.round(v / a.ent * 100)}%</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="n">${fmt(a.ent)}</td><td class="n">100%</td></tr></tfoot></table>` : ''}

    ${cofres.length ? `<h2>Cofrinhos</h2>
    <table class="rel-tab">
      <thead><tr><th>Cofrinho</th><th>Banco</th><th class="n">Saldo</th><th class="n">Meta</th><th class="n">Da meta</th></tr></thead>
      <tbody>${cofres.map(({ cf, s }) => `<tr><td>${esc(cf.nome)}</td><td>${esc(cf.banco || '—')}</td><td class="n">${fmt(s)}</td><td class="n">${num(cf.meta) ? fmt(cf.meta) : '—'}</td><td class="n">${num(cf.meta) ? Math.round(s / num(cf.meta) * 100) + '%' : '—'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="n">${fmt(hoje.totalCofres)}</td><td></td><td></td></tr></tfoot>
    </table>` : ''}
  </section>`;

  // Página 3: extrato e pendências
  let extrato = '', dia = '';
  for (const e of doPer) {
    const dd = e.quando.slice(0, 10);
    if (dd !== dia) { extrato += `<tr class="rel-dia"><td colspan="5">${esc(maiuscula(paraData(dd + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })))}</td></tr>`; dia = dd; }
    let desc, cat;
    if (e.tipo === 'lanc') { desc = e.l.descricao || e.l.categoria; cat = e.l.categoria + (e.l.registro ? ' · Nº ' + e.l.registro : ''); }
    else if (e.tipo === 'mov') { desc = (e.m.tipo === 'Guardar' ? 'Guardado em ' : 'Resgatado de ') + e.nome; cat = 'Cofrinho'; }
    else { desc = 'Recebido ' + (e.r.devedor === 'Igreja' ? 'da igreja' : 'de ' + e.r.devedor); cat = 'A receber'; }
    extrato += `<tr class="${e.tipo === 'lanc' ? '' : 'cinza'}"><td>${hora(e.quando)}</td><td>${esc(desc)}</td><td>${esc(cat)}</td>
      <td class="n ${e.v < 0 ? '' : 'rel-pos'}">${e.v < 0 ? '−' : '+'}${fmt(Math.abs(e.v))}</td><td class="n">${fmt(e.saldo)}</td></tr>`;
  }
  const pendRec = d.receber.filter(r => r.status !== 'Recebido');
  const lancDe = id => d.lancamentos.find(l => String(l.id) === String(id));
  const comp = d.versao >= 4 ? abertos().sort((x, y) => x.vencimento.localeCompare(y.vencimento)) : [];
  const pag3 = `
  <section class="rel-pag">
    ${cab('Extrato e pendências')}
    <h2>Extrato da carteira</h2>
    <table class="rel-tab">
      <thead><tr><th>Hora</th><th>Descrição</th><th>Categoria</th><th class="n">Valor</th><th class="n">Saldo</th></tr></thead>
      <tbody><tr class="sub"><td colspan="4">Saldo no início do período</td><td class="n">${fmt(saldoIni)}</td></tr>${extrato || '<tr><td colspan="5">Nenhum movimento no período.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="4">Saldo ${fimRotulo}</td><td class="n">${fmt(saldoFim)}</td></tr></tfoot>
    </table>
    <p class="rel-nota">Em cinza, o que mexe na carteira sem ser gasto ou entrada: dinheiro guardado ou resgatado dos cofrinhos e valores recebidos de volta.</p>

    <h2>Pendências</h2>
    <h3>A receber · ${fmt(hoje.aReceber)}</h3>
    ${pendRec.length ? `<table class="rel-tab">
      <thead><tr><th>De quem</th><th>Referente a</th><th>Data</th><th>Situação</th><th class="n">Valor</th></tr></thead>
      <tbody>${pendRec.map(r => { const l = lancDe(r.lancamentoId); return `<tr><td>${r.devedor === 'Igreja' ? 'Igreja (reembolso)' : esc(r.devedor)}</td><td>${esc(l ? l.descricao || l.categoria : '—')}${r.registro ? ' · Nº ' + esc(r.registro) : ''}</td><td>${paraData(r.dataHora).toLocaleDateString('pt-BR')}</td><td>${esc(r.status || 'Pendente')}</td><td class="n">${fmt(r.valor)}</td></tr>`; }).join('')}</tbody>
    </table>` : '<p class="rel-nota">Nada a receber.</p>'}

    <h3>Dízimos e ofertas a enviar · ${fmt(hoje.reservado)}</h3>
    ${hoje.reservado > 0 ? `<table class="rel-tab"><tbody>
      <tr><td>Dízimo</td><td class="n">${fmt(hoje.dizimoRes)}</td></tr><tr><td>Oferta</td><td class="n">${fmt(hoje.ofertaRes)}</td></tr>
    </tbody></table>` : '<p class="rel-nota">Nada separado no momento.</p>'}

    <h3>Próximos compromissos</h3>
    ${comp.length ? `<table class="rel-tab">
      <thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th>Repete</th><th class="n">Valor</th></tr></thead>
      <tbody>${comp.map(c => `<tr><td class="${diasAte(c.vencimento) < 0 ? 'rel-neg' : ''}">${paraData(c.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}${diasAte(c.vencimento) < 0 ? ' (atrasado)' : ''}</td><td>${esc(c.descricao)}</td><td>${esc(c.categoria || '—')}</td><td>${c.repete === 'Mensal' ? 'todo mês' : '—'}</td><td class="n">${c.valor ? fmt(c.valor) : '—'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Total</td><td class="n">${fmt(r2(comp.reduce((s, c) => s + num(c.valor), 0)))}</td></tr></tfoot>
    </table>` : '<p class="rel-nota">Nenhum compromisso em aberto.</p>'}
  </section>`;

  return pag1 + pag2 + pag3;
}

function gerarPdf() {
  const el = $('#relatorio');
  el.innerHTML = relatorio();
  const tituloAntes = document.title;
  document.title = `HRM Finance - ${periodo(S.per, S.refAn).rotulo}`;
  const limpar = () => { document.title = tituloAntes; window.removeEventListener('afterprint', limpar); };
  window.addEventListener('afterprint', limpar);
  avisar('Escolha "Salvar como PDF" na janela de impressão.');
  setTimeout(() => window.print(), 300);
}

/* ---------- COMPROMISSOS ---------- */
function telaCompromissos() {
  const d = S.dados;
  if (d.versao < 4) return `
  ${cabecalho('Compromissos', { voltar: S.origem })}
  <div class="card dica">${icone.dica}<div><b>Atualize o código da planilha</b><br>Para usar esta parte, cole o novo <b>apps-script/Codigo.gs</b> no Apps Script e publique uma nova versão (veja "Manutenção" no README).</div></div>`;
  const ab = abertos().sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const atrasados = ab.filter(c => diasAte(c.vencimento) < 0);
  const semana = ab.filter(c => diasAte(c.vencimento) >= 0 && diasAte(c.vencimento) <= 7);
  const depois = ab.filter(c => diasAte(c.vencimento) > 7);
  const noMes = ab.filter(c => c.vencimento <= fimDoMes());
  const totMes = r2(noMes.reduce((s, c) => s + num(c.valor), 0));
  const carteira = calcular(d, chaveMes()).carteira;
  const pagos = d.compromissos.filter(c => c.pagoEm).sort((a, b) => String(b.pagoEm).localeCompare(String(a.pagoEm))).slice(0, 10);
  const item = c => `
    <button class="item" data-acao="menuCompromisso" data-id="${esc(c.id)}">
      <span class="ico" style="background:${corCat('Saída', c.categoria)}26;color:${corCat('Saída', c.categoria)}">${esc(dataCurta(c.vencimento + 'T12:00:00').slice(0, 2))}</span>
      <span class="meio">
        <div class="t1">${esc(c.descricao)}${c._pendente ? '<span class="tag-pend">enviando</span>' : ''}</div>
        <div class="t2">${[quandoVence(c.vencimento), c.categoria, c.repete === 'Mensal' ? 'todo mês' : ''].filter(Boolean).map(esc).join(' · ')}</div>
      </span>
      <span class="val num ${diasAte(c.vencimento) < 0 ? 'neg' : ''}">${c.valor ? fmt(c.valor) : '—'}</span></button>`;
  const bloco = (titulo, l) => l.length ? `<h2>${titulo}</h2><div class="lista">${l.map(item).join('')}</div>` : '';
  return `
  ${cabecalho('Compromissos', { voltar: S.origem })}
  <section class="heroi">
    <div class="rotulo">A pagar até o fim de ${esc(nomeMes(chaveMes(), false))}</div>
    <div class="valor-grande num">${fmt(totMes)}</div>
    <div class="rodape">
      <div class="mes-saldo"><span>Na carteira</span><b class="num">${fmt(carteira)}</b></div>
      <div class="mes-saldo" style="text-align:right"><span>Depois de pagar</span><b class="num ${carteira - totMes < 0 ? 'neg' : ''}">${fmt(r2(carteira - totMes))}</b></div>
    </div>
  </section>
  <button class="btn" data-acao="novoCompromisso">+ Novo compromisso</button>
  ${bloco('<span class="neg">Atrasados</span>', atrasados)}
  ${bloco('Próximos 7 dias', semana)}
  ${bloco('Mais adiante', depois)}
  ${!ab.length ? '<div class="card vazio" style="margin-top:14px">Nenhum compromisso. Registre contas e pagamentos que você precisa lembrar de fazer.</div>' : ''}
  ${pagos.length ? `<h2>Pagos recentemente</h2><div class="lista">${pagos.map(c => `
    <div class="item"><span class="meio"><div class="t1">${esc(c.descricao)}</div><div class="t2">pago em ${dataCurta(c.pagoEm)}${c.repete === 'Mensal' ? ' · próximo ' + dataCurta(c.vencimento + 'T12:00:00') : ''}</div></span></div>`).join('')}</div>` : ''}`;
}

function folhaCompromisso(id) {
  const c = id ? S.dados.compromissos.find(x => String(x.id) === String(id)) : null;
  const v = c ? Math.round(num(c.valor) * 100) : 0;
  const cat = c ? c.categoria : '';
  abrirFolha(`
    <h3>${c ? 'Editar compromisso' : 'Novo compromisso'}</h3>
    <label class="rotulo-campo" for="inCompDesc">O que é</label>
    <input id="inCompDesc" class="campo" placeholder="Ex.: inscrição do congresso, conta de luz" value="${esc(c ? c.descricao : '')}" autocomplete="off">
    <label class="rotulo-campo" for="inCompValor">Valor <span class="muted">(opcional)</span></label>
    <input id="inCompValor" class="campo" data-dinheiro inputmode="numeric" placeholder="R$ 0,00" autocomplete="off" data-centavos="${v}" value="${v ? fmt(v / 100) : ''}">
    <label class="rotulo-campo" for="inCompData">Vencimento</label>
    <input id="inCompData" class="campo" type="date" value="${c ? c.vencimento : ''}">
    <span class="rotulo-campo">Categoria <span class="muted">(opcional)</span></span>
    <div class="chips" id="compCats">${categorias('Saída').map(x => `<button class="chip pequeno ${cat === x.nome ? 'on' : ''}" data-acao="compCat" data-nome="${esc(x.nome)}"><span class="bolinha" style="background:${x.cor}"></span>${esc(x.nome)}</button>`).join('')}</div>
    <div class="ajuste-item" style="border:0">
      <div><b>Repete todo mês</b><div class="muted pequeno">Depois de pago, volta no mesmo dia do mês seguinte</div></div>
      <button class="interruptor ${c && c.repete === 'Mensal' ? 'on' : ''}" id="compMensal" data-acao="compMensal" aria-label="Repete todo mês"></button>
    </div>
    <button class="btn" data-acao="salvarCompromisso" data-id="${esc(c ? c.id : '')}">${c ? 'Salvar' : 'Criar compromisso'}</button>
    <button class="btn secundario" data-acao="fecharFolha">Cancelar</button>`, () => { if (!c) $('#inCompDesc').focus(); });
}

function folhaMenuCompromisso(id) {
  const c = S.dados.compromissos.find(x => String(x.id) === String(id)); if (!c) return;
  abrirFolha(`
    <h3>${esc(c.descricao)}</h3>
    <p class="muted pequeno" style="margin:0 0 6px">${[c.valor ? fmt(c.valor) : '', quandoVence(c.vencimento), c.repete === 'Mensal' ? 'todo mês' : ''].filter(Boolean).join(' · ')}</p>
    <button class="menu-op" data-acao="pagarCompromisso" data-id="${esc(id)}">${icone.desce} Paguei: registrar a saída</button>
    <button class="menu-op" data-acao="editarCompromisso" data-id="${esc(id)}">${icone.lapis} Editar</button>
    <button class="menu-op perigo" data-acao="excluirCompromisso" data-id="${esc(id)}">${icone.lixo} Excluir</button>
    <button class="btn secundario" data-acao="fecharFolha">Fechar</button>`);
}

/* ---------- LANÇAR ---------- */
function novoForm() {
  return { id: null, tipo: 'Saída', centavos: 0, categoria: null, catManual: false,
    pagamento: lsGet('hrm_ultimo_pag', 'Pix'), descricao: '', dataHora: null,
    dizimo: null, oferta: null, temSep: false, sepEnviada: false, ofertaCentavos: 0, ofertaManual: false,
    receber: { modo: 'nao', pessoas: [], manual: false, travado: false } };
}

function lancar() {
  const f = S.form;
  const edit = !!f.id;
  const cats = categorias(f.tipo);
  const descricoes = [...new Set(S.dados.lancamentos
    .filter(l => l.tipo === f.tipo && l.descricao)
    .sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)))
    .map(l => l.descricao))].slice(0, 60);
  const classeTipo = f.tipo === 'Saída' ? 'saida' : 'entrada';

  return `
  ${cabecalho(edit ? 'Editar lançamento' : 'Novo lançamento', { voltar: edit ? 'fluxo' : S.origem })}
  <div class="alterna">
    <button class="saida ${f.tipo === 'Saída' ? 'on' : ''}" data-acao="tipo" data-tipo="Saída">Saída</button>
    <button class="entrada ${f.tipo === 'Entrada' ? 'on' : ''}" data-acao="tipo" data-tipo="Entrada">Entrada</button>
  </div>

  <div class="valor-entrada">
    <label for="inValor">Valor</label>
    <input id="inValor" class="${classeTipo}" data-dinheiro data-campo="centavos" data-centavos="${f.centavos}"
      inputmode="numeric" autocomplete="off" placeholder="R$ 0,00" value="${f.centavos ? fmt(f.centavos / 100) : ''}">
  </div>

  <span class="rotulo-campo">Categoria</span>
  <div class="chips">
    ${cats.map(c => `<button class="chip ${f.categoria === c.nome ? 'on' : ''}" data-acao="cat" data-nome="${esc(c.nome)}"><span class="bolinha" style="background:${c.cor}"></span>${esc(c.nome)}</button>`).join('')}
    <button class="chip" data-acao="novaCat" data-tipo="${esc(f.tipo)}">+ Nova</button>
  </div>

  ${f.tipo === 'Saída' ? `
  <span class="rotulo-campo">Forma de pagamento</span>
  <div class="chips">
    ${PAGAMENTOS.map(p => `<button class="chip ${f.pagamento === p ? 'on' : ''}" data-acao="pag" data-nome="${p}">${p}</button>`).join('')}
  </div>` : ''}

  <label class="rotulo-campo" for="inDesc">Descrição <span class="muted">(opcional)</span></label>
  <input id="inDesc" class="campo" data-campo="descricao" list="sugDesc" autocomplete="off"
    placeholder="${f.tipo === 'Saída' ? 'Ex.: mercado, almoço, uber' : 'Ex.: salário de outubro'}" value="${esc(f.descricao)}">
  <datalist id="sugDesc">${descricoes.map(x => `<option value="${esc(x)}">`).join('')}</datalist>

  ${f.tipo === 'Entrada' && S.dados.versao >= 2 ? caixaDizimar(f) : ''}
  ${f.tipo === 'Saída' && S.dados.versao >= 3 ? caixaReceber(f) : ''}

  <label class="rotulo-campo" for="inData">Data e hora</label>
  <input id="inData" type="datetime-local" class="campo" data-campo="dataHora" value="${(f.dataHora || isoLocal()).slice(0, 16)}">

  <button class="btn" data-acao="salvarLanc">${edit ? 'Salvar alterações' : 'Registrar ' + f.tipo.toLowerCase()}</button>
  ${edit ? `
  <button class="btn perigo" data-acao="excluirLanc">Excluir lançamento</button>
  <button class="btn secundario" data-acao="cancelarEdicao">Cancelar</button>` : ''}`;
}

/* Dízimo e oferta ligados? O que o usuário escolheu, senão a última escolha para esta categoria */
function liga(f, parte) {
  if (f[parte] !== null) return f[parte];
  const pref = lsGet('hrm_separar', {})[f.categoria] || {};
  return pref[parte] !== false;
}

/* A oferta sugerida acompanha o dízimo até o usuário digitar outro valor */
const ofertaDe = f => f.ofertaManual ? f.ofertaCentavos / 100 : dizimoDe(f.centavos / 100);

function caixaDizimar(f) {
  if (f.sepEnviada) return `
  <div class="card dizimar"><div class="linha"><div><b>Dízimo e oferta</b><div class="muted pequeno">Os desta entrada já foram enviados à igreja.</div></div></div></div>`;
  const dz = liga(f, 'dizimo'), of = liga(f, 'oferta');
  const ofC = Math.round(ofertaDe(f) * 100);
  return `
  <div class="card dizimar">
    <div class="linha">
      <div><b>Dízimo</b><div class="muted pequeno">10% da entrada</div></div>
      <button class="interruptor ${dz ? 'on' : ''}" data-acao="alternarSep" data-parte="dizimo" aria-label="Dízimo"></button>
    </div>
    ${dz ? `
    <div class="linha valor-sep">
      <span>Valor do dízimo</span>
      <b class="num" id="valDizimo">${fmt(dizimoDe(f.centavos / 100))}</b>
    </div>` : ''}
    <div class="linha separa">
      <div><b>Oferta</b><div class="muted pequeno">Sugestão: igual ao dízimo</div></div>
      <button class="interruptor ${of ? 'on' : ''}" data-acao="alternarSep" data-parte="oferta" aria-label="Oferta"></button>
    </div>
    ${of ? `
    <div class="linha valor-sep">
      <label for="inOferta">Valor da oferta</label>
      <input id="inOferta" class="campo" data-dinheiro inputmode="numeric" autocomplete="off" placeholder="R$ 0,00"
        data-centavos="${ofC}" value="${ofC ? fmt(ofC / 100) : ''}">
    </div>` : ''}
  </div>`;
}

function atualizarCaixaDizimar() {
  const el = $('.dizimar');
  if (el && S.form) el.outerHTML = caixaDizimar(S.form);
}

/* Valor digitado mudou: atualiza o dízimo e a oferta sugerida */
function atualizarPrevDizimo() {
  const f = S.form;
  if (!f) return;
  const vd = $('#valDizimo');
  if (vd) vd.textContent = fmt(dizimoDe(f.centavos / 100));
  const i = $('#inOferta');
  if (i && !f.ofertaManual && document.activeElement !== i) {
    const c = Math.round(ofertaDe(f) * 100);
    i.dataset.centavos = c; i.value = c ? fmt(c / 100) : '';
  }
}

/* ---------- a receber, no formulário de saída ---------- */
function receberDoForm(l) {
  const rs = S.dados.receber.filter(r => String(r.lancamentoId) === String(l.id));
  const base = { modo: 'nao', pessoas: [], manual: true, travado: rs.some(r => r.status === 'Recebido') };
  if (!rs.length) return { ...base, manual: false };
  if (rs.length === 1 && rs[0].devedor === 'Igreja') return { ...base, modo: 'igreja' };
  return { ...base, modo: 'dividir', pessoas: rs.map(r => ({ nome: r.devedor, centavos: Math.round(num(r.valor) * 100) })) };
}

const devedoresConhecidos = () => [...new Set(S.dados.receber.map(r => r.devedor).filter(n => n && n !== 'Igreja'))];

/* Divide igualmente entre você e as pessoas; a sobra de centavos fica com você */
function dividirIgual(f) {
  const rc = f.receber, n = rc.pessoas.length;
  if (!n || rc.manual) return;
  const parte = Math.floor(f.centavos / (n + 1));
  rc.pessoas.forEach(p => { p.centavos = parte; });
}

function caixaReceber(f) {
  const rc = f.receber;
  if (rc.travado) return `
  <div class="card receber-caixa"><b>Receber de volta</b><div class="muted pequeno">Parte deste valor já foi recebida. Veja em <b>A receber</b>.</div></div>`;
  const ligado = rc.modo !== 'nao';
  const chip = (m, t) => `<button class="chip pequeno ${rc.modo === m ? 'on' : ''}" data-acao="modoReceber" data-modo="${m}">${t}</button>`;
  const totalP = rc.pessoas.reduce((s, p) => s + (p.centavos || 0), 0);
  let corpo = '';
  if (rc.modo === 'igreja') corpo = `
    <p class="muted pequeno" id="txtIgreja">${f.centavos ? `<b>${fmt(f.centavos / 100)}</b> a receber da igreja. Não conta como seu gasto.` : 'O valor todo volta como reembolso da igreja.'}</p>`;
  else if (rc.modo === 'dividir') corpo = `
    <div class="pessoas">
      ${rc.pessoas.map((p, i) => `
      <div class="pessoa">
        <input class="campo" data-rec-nome="${i}" list="sugPessoas" placeholder="Nome" value="${esc(p.nome)}" autocomplete="off">
        <input class="campo valor" data-rec-valor="${i}" data-dinheiro inputmode="numeric" placeholder="R$ 0,00" autocomplete="off"
          data-centavos="${p.centavos || 0}" value="${p.centavos ? fmt(p.centavos / 100) : ''}">
        <button class="x-btn" data-acao="tirarPessoa" data-i="${i}" aria-label="Remover pessoa">${icone.x}</button>
      </div>`).join('')}
    </div>
    <datalist id="sugPessoas">${devedoresConhecidos().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <button class="chip pequeno" data-acao="maisPessoa">+ Pessoa</button>
    <p class="muted pequeno" id="txtParte">Sua parte: <b>${fmt((f.centavos - totalP) / 100)}</b> · a receber: <b>${fmt(totalP / 100)}</b></p>`;
  return `
  <div class="card receber-caixa">
    <div class="linha">
      <div><b>Receber de volta</b><div class="muted pequeno">Reembolso da igreja ou valor dividido com outras pessoas</div></div>
      <button class="interruptor ${ligado ? 'on' : ''}" data-acao="ligarReceber" aria-label="Receber de volta"></button>
    </div>
    ${ligado ? `<div class="chips" style="margin-top:10px">${chip('igreja', 'Reembolso')}${chip('dividir', 'Valor dividido')}</div>` : ''}
    ${corpo}
  </div>`;
}

function atualizarCaixaReceber() {
  const el = $('.receber-caixa');
  if (el && S.form) el.outerHTML = caixaReceber(S.form);
}

/* Valor mudou: refaz a divisão e os textos sem redesenhar os campos em uso */
function atualizarTextosReceber() {
  const f = S.form;
  if (!f || f.tipo !== 'Saída') return;
  const rc = f.receber;
  const ti = $('#txtIgreja');
  if (ti && f.centavos) ti.innerHTML = `<b>${fmt(f.centavos / 100)}</b> a receber da igreja. Não conta como seu gasto.`;
  if (rc.modo !== 'dividir') return;
  dividirIgual(f);
  rc.pessoas.forEach((p, i) => {
    const inp = $(`[data-rec-valor="${i}"]`);
    if (inp && document.activeElement !== inp) { inp.dataset.centavos = p.centavos || 0; inp.value = p.centavos ? fmt(p.centavos / 100) : ''; }
  });
  const totalP = rc.pessoas.reduce((s, p) => s + (p.centavos || 0), 0);
  const tp = $('#txtParte');
  if (tp) tp.innerHTML = `Sua parte: <b>${fmt((f.centavos - totalP) / 100)}</b> · a receber: <b>${fmt(totalP / 100)}</b>`;
}

/* Linhas a receber de uma saída, mantendo id e situação das que já existiam */
function montarReceber(f, antes) {
  const rc = f.receber, valor = f.centavos / 100;
  const lista = rc.modo === 'igreja' ? [{ devedor: 'Igreja', valor }]
    : rc.modo === 'dividir' ? rc.pessoas.map(p => ({ devedor: p.nome.trim(), valor: (p.centavos || 0) / 100 })) : [];
  const usados = new Set();
  return lista.map(r => {
    const velho = (antes || []).find(a => a.devedor === r.devedor && !usados.has(a.id));
    if (velho) usados.add(velho.id);
    return { id: velho ? velho.id : uid(), devedor: r.devedor, valor: r2(r.valor), status: velho ? velho.status : 'Pendente' };
  });
}

function marcarChips() {
  $$('[data-acao="cat"]').forEach(b => b.classList.toggle('on', b.dataset.nome === S.form.categoria));
  $$('[data-acao="pag"]').forEach(b => b.classList.toggle('on', b.dataset.nome === S.form.pagamento));
}

function sugerirCategoria(txt) {
  const f = S.form;
  if (!f || f.catManual) return;
  const k = normalizar(txt);
  if (!k) return;
  const anterior = S.dados.lancamentos
    .filter(l => l.tipo === f.tipo && normalizar(l.descricao) === k)
    .sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)))[0];
  let cat = anterior ? anterior.categoria : null;
  if (anterior && anterior.pagamento && f.tipo === 'Saída') f.pagamento = anterior.pagamento;
  if (!cat) {
    const nomes = categorias(f.tipo).map(c => c.nome);
    for (const nome of nomes) {
      const lista = PALAVRAS[nome] || [];
      if (lista.some(p => k.split(/\s+/).includes(p) || (p.length > 4 && k.includes(p)))) { cat = nome; break; }
    }
  }
  if (cat && categorias(f.tipo).some(c => c.nome === cat)) {
    const mudou = f.categoria !== cat;
    f.categoria = cat; marcarChips();
    if (mudou && f.tipo === 'Entrada') atualizarCaixaDizimar();
  }
}

/* ---------- ECONOMIAS ---------- */
function economias() {
  const d = S.dados;
  const c = calcular(d, chaveMes());
  const porBanco = {};
  d.cofrinhos.forEach(cf => {
    const b = cf.banco || 'Sem banco';
    porBanco[b] = (porBanco[b] || 0) + (c.saldoCofre[String(cf.id)] || 0);
  });
  const bancos = Object.entries(porBanco).sort((a, b) => b[1] - a[1]);

  return `
  ${cabecalho('Cofrinhos', { voltar: S.origem })}
  <div class="resumo-eco">
    <div class="card"><div class="muted pequeno">Guardado</div><div class="v num">${fmt(c.totalCofres)}</div></div>
    <div class="card"><div class="muted pequeno">Rendeu este mês</div><div class="v num ${c.rendMes < 0 ? 'neg' : 'pos'}">${sinal(c.rendMes)}</div></div>
  </div>

  ${bancos.length ? `
  <h2>Por banco</h2>
  <div class="card bancos">
    ${bancos.map(([b, v]) => `<div class="banco"><span><span class="tag">${esc(b.slice(0, 2).toUpperCase())}</span>${esc(b)}</span><b class="num">${fmt(v)}</b></div>`).join('')}
  </div>` : ''}

  <h2>Dízimos e ofertas</h2>
  <button class="card linha-btn" data-acao="abrirDizimos">
    <div><b>Reservado para a igreja</b><div class="muted pequeno">Fora do saldo total. Toque para ver e enviar.</div></div>
    <b class="num">${fmt(c.reservado)}</b>
  </button>

  <h2>Cofrinhos</h2>
  ${d.cofrinhos.length ? d.cofrinhos.map(cf => cardCofre(cf, c)).join('')
    : `<div class="card vazio">Você ainda não tem cofrinhos.<br>Crie o primeiro para começar a guardar.</div>`}
  <button class="btn" data-acao="novoCofre">+ Novo cofrinho</button>`;
}

function cardCofre(cf, c) {
  const id = String(cf.id);
  const saldo = r2(c.saldoCofre[id] || 0);
  const meta = num(cf.meta);
  const pct = meta > 0 ? Math.min(100, Math.round(saldo / meta * 100)) : 0;
  const rend = r2(c.rendCofreMes[id] || 0);
  return `
  <div class="card cofre">
    <div class="cab-c">
      <div><div class="nome">${esc(cf.nome)}</div><div class="banco-nome">${esc(cf.banco || 'Sem banco')}</div></div>
      <button class="mais-btn" data-acao="menuCofre" data-id="${esc(id)}" aria-label="Opções">${icone.mais}</button>
    </div>
    <div class="saldo num">${fmt(saldo)}</div>
    ${rend ? `<div class="rendeu">${sinal(rend)} de rendimento este mês</div>` : ''}
    ${meta > 0 ? `
    <div class="barra"><div style="width:${pct}%"></div></div>
    <div class="meta-txt"><span>Meta ${fmt(meta)}</span><span>${pct}%${saldo < meta ? ` · faltam ${fmt(meta - saldo)}` : ' · alcançada!'}</span></div>` : ''}
    <div class="acoes-cofre">
      <button data-acao="movCofre" data-tipo="Guardar" data-id="${esc(id)}">Guardar</button>
      <button data-acao="movCofre" data-tipo="Resgatar" data-id="${esc(id)}">Resgatar</button>
      <button data-acao="atualizarCofre" data-id="${esc(id)}">Atualizar saldo</button>
    </div>
  </div>`;
}

const acharCofre = id => S.dados.cofrinhos.find(c => String(c.id) === String(id));

function folhaMov(id, tipo) {
  const cf = acharCofre(id); if (!cf) return;
  const c = calcular(S.dados, chaveMes());
  const saldo = saldoDoCofre(id);
  abrirFolha(`
    <h3>${tipo === 'Guardar' ? 'Guardar em' : 'Resgatar de'} ${esc(cf.nome)}</h3>
    <p class="muted pequeno">${tipo === 'Guardar'
      ? `O valor sai da carteira. Disponível: <b>${fmt(c.carteira)}</b>`
      : `O valor volta para a carteira. No cofrinho: <b>${fmt(saldo)}</b>`}</p>
    <div class="valor-entrada"><input id="inMov" data-dinheiro inputmode="numeric" placeholder="R$ 0,00" autocomplete="off"></div>
    ${tipo === 'Resgatar' && saldo > 0 ? `<div style="text-align:center"><button class="chip pequeno" data-acao="resgatarTudo" data-valor="${saldo}">Resgatar tudo</button></div>` : ''}
    <button class="btn" data-acao="confirmarMov" data-id="${esc(id)}" data-tipo="${tipo}">${tipo}</button>
    <button class="btn secundario" data-acao="fecharFolha">Cancelar</button>`, () => $('#inMov').focus());
}

function folhaAtualizar(id) {
  const cf = acharCofre(id); if (!cf) return;
  const saldo = saldoDoCofre(id);
  abrirFolha(`
    <h3>Atualizar saldo</h3>
    <p class="muted pequeno">Abra o app do ${esc(cf.banco || 'banco')}, veja quanto tem hoje em <b>${esc(cf.nome)}</b> e digite abaixo. A diferença entra como rendimento.</p>
    <div class="valor-entrada">
      <label for="inSaldoNovo">Saldo atual no banco</label>
      <input id="inSaldoNovo" data-dinheiro inputmode="numeric" autocomplete="off" placeholder="R$ 0,00"
        data-centavos="${Math.round(saldo * 100)}" data-anterior="${saldo}" value="${saldo > 0 ? fmt(saldo) : ''}">
    </div>
    <div class="dif" id="dif">No app: ${fmt(saldo)}</div>
    <button class="btn" data-acao="confirmarAtualizar" data-id="${esc(id)}">Atualizar</button>
    <button class="btn secundario" data-acao="fecharFolha">Cancelar</button>`, () => { const i = $('#inSaldoNovo'); i.focus(); i.select(); });
}

function atualizarDif() {
  const i = $('#inSaldoNovo'), el = $('#dif');
  if (!i || !el) return;
  const dif = r2((+i.dataset.centavos || 0) / 100 - num(i.dataset.anterior));
  el.innerHTML = dif === 0 ? 'Sem mudança' : `Rendimento: <b class="${dif > 0 ? 'pos' : 'neg'}">${sinal(dif)}</b>`;
}

function folhaCofre(id) {
  const cf = id ? acharCofre(id) : null;
  const bancos = [...new Set(S.dados.cofrinhos.map(c => c.banco).filter(Boolean))];
  const meta = cf ? num(cf.meta) : 0;
  abrirFolha(`
    <h3>${cf ? 'Editar cofrinho' : 'Novo cofrinho'}</h3>
    <label class="rotulo-campo" for="inNomeCofre">Nome</label>
    <input id="inNomeCofre" class="campo" placeholder="Ex.: Reserva de emergência" value="${esc(cf ? cf.nome : '')}" autocomplete="off">
    <label class="rotulo-campo" for="inBanco">Banco</label>
    <input id="inBanco" class="campo" list="sugBancos" placeholder="Ex.: Nubank, Inter, Caixa" value="${esc(cf ? cf.banco : '')}" autocomplete="off">
    <datalist id="sugBancos">${bancos.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
    ${bancos.length ? `<div class="chips" style="margin-top:8px">${bancos.map(b => `<button class="chip pequeno" data-acao="bancoChip" data-nome="${esc(b)}">${esc(b)}</button>`).join('')}</div>` : ''}
    <label class="rotulo-campo" for="inMeta">Meta <span class="muted">(opcional)</span></label>
    <input id="inMeta" class="campo" data-dinheiro inputmode="numeric" placeholder="R$ 0,00" autocomplete="off"
      data-centavos="${Math.round(meta * 100)}" value="${meta ? fmt(meta) : ''}">
    ${cf ? '' : `
    <label class="rotulo-campo" for="inSaldoCofre">Quanto já tem nele? <span class="muted">(não sai da carteira)</span></label>
    <input id="inSaldoCofre" class="campo" data-dinheiro inputmode="numeric" placeholder="R$ 0,00" autocomplete="off">`}
    <button class="btn" data-acao="salvarCofre" data-id="${esc(cf ? cf.id : '')}">${cf ? 'Salvar' : 'Criar cofrinho'}</button>
    <button class="btn secundario" data-acao="fecharFolha">Cancelar</button>`, () => { if (!cf) $('#inNomeCofre').focus(); });
}

function folhaMenuCofre(id) {
  const cf = acharCofre(id); if (!cf) return;
  abrirFolha(`
    <h3>${esc(cf.nome)}</h3>
    <p class="muted pequeno" style="margin:0 0 6px">${esc(cf.banco || 'Sem banco')}</p>
    <button class="menu-op" data-acao="verMovs" data-id="${esc(id)}">${icone.lista} Ver movimentos</button>
    <button class="menu-op" data-acao="editarCofre" data-id="${esc(id)}">${icone.lapis} Editar nome, banco e meta</button>
    <button class="menu-op perigo" data-acao="excluirCofre" data-id="${esc(id)}">${icone.lixo} Excluir cofrinho</button>`);
}

function folhaMovimentos(id) {
  const cf = acharCofre(id); if (!cf) return;
  const movs = S.dados.movimentos.filter(m => String(m.cofrinhoId) === String(id))
    .sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)));
  const rot = { Inicial: 'Saldo inicial', Guardar: 'Guardado', Resgatar: 'Resgatado', Rendimento: 'Rendimento' };
  abrirFolha(`
    <h3>${esc(cf.nome)}</h3>
    <p class="muted pequeno" style="margin:0 0 12px">Saldo: <b>${fmt(saldoDoCofre(id))}</b></p>
    <div class="lista">
    ${movs.length ? movs.map(m => {
      const v = m.tipo === 'Resgatar' ? -num(m.valor) : num(m.valor);
      return `<div class="item">
        <span class="ico" style="background:var(--bg2);color:var(--ic2)">${v >= 0 ? icone.sobe : icone.desce}</span>
        <span class="meio"><div class="t1">${rot[m.tipo] || esc(m.tipo)}</div><div class="t2">${dataCurta(m.dataHora)} · ${hora(m.dataHora)}</div></span>
        <span class="val num ${v >= 0 ? 'pos' : 'neg'}">${sinal(v)}</span></div>`;
    }).join('') : '<div class="vazio">Nenhum movimento ainda.</div>'}
    </div>
    <button class="btn secundario" data-acao="fecharFolha">Fechar</button>`);
}

/* ---------- DÍZIMOS E OFERTAS ---------- */
function dizimos() {
  const d = S.dados;
  const c = calcular(d, chaveMes());
  const acharOrigem = id => d.lancamentos.find(l => String(l.id) === String(id));
  // Agrupa dízimo e oferta pela entrada de origem (mesmo registro)
  const grupos = {};
  for (const l of c.pendIgreja) {
    const g = grupos[l.origemId] || (grupos[l.origemId] = { origemId: l.origemId, dataHora: l.dataHora, dizimo: 0, oferta: 0, idItem: l.id, pendente: false });
    g[l.parte === 'Oferta' ? 'oferta' : 'dizimo'] += num(l.valor);
    g.pendente = g.pendente || !!l._pendente;
    if (l.parte === 'Dízimo') g.idItem = l.id;
  }
  const pend = Object.values(grupos).sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)));
  const envios = d.envios.slice().sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)));

  if (d.versao < 2) return `
  ${cabecalho('Fidelidade', { voltar: S.origem })}
  <div class="card dica">${icone.dica}<div><b>Atualize o código da planilha</b><br>Para usar esta parte, cole o novo <b>apps-script/Codigo.gs</b> no Apps Script e publique uma nova versão (veja "Manutenção" no README).</div></div>`;

  return `
  ${cabecalho('Fidelidade', { voltar: S.origem })}
  <section class="heroi">
    <div class="rotulo">Total separado</div>
    <div class="valor-grande num">${fmt(c.reservado)}</div>
    <div class="rodape">
      <div class="mes-saldo"><span>Dízimo</span><b class="num">${fmt(c.dizimoRes)}</b></div>
      <div class="mes-saldo" style="text-align:right"><span>Oferta</span><b class="num">${fmt(c.ofertaRes)}</b></div>
    </div>
  </section>
  <p class="muted pequeno" style="margin:10px 2px 0">Esse valor já saiu da carteira e não entra no saldo total.</p>
  ${c.reservado > 0 ? `<button class="btn" data-acao="enviarIgreja">Enviei para a igreja</button>` : ''}

  <h2>A enviar</h2>
  <div class="lista">${pend.length ? pend.map(g => {
    const o = acharOrigem(g.origemId);
    const nome = o ? (o.descricao || o.categoria) : 'Entrada';
    const reg = o && o.registro ? `Nº ${esc(o.registro)} · ` : '';
    return `<button class="item" data-acao="editarLanc" data-id="${esc(g.idItem)}">
      <span class="ico" style="background:${corCat('Saída', CAT_DIZIMO)}26;color:${corCat('Saída', CAT_DIZIMO)}">D</span>
      <span class="meio">
        <div class="t1">${esc(nome)}${g.pendente ? '<span class="tag-pend">enviando</span>' : ''}</div>
        <div class="t2">${reg}${dataCurta(g.dataHora)}${o ? ' · entrada de ' + fmt(o.valor) : ''}</div>
        <div class="t2">Dízimo ${fmt(g.dizimo)} + oferta ${fmt(g.oferta)}</div>
      </span>
      <span class="val num">${fmt(g.dizimo + g.oferta)}</span></button>`;
  }).join('') : '<div class="card vazio">Nada separado agora. Ao registrar uma entrada, ligue o dízimo ou a oferta.</div>'}</div>

  ${envios.length ? `
  <h2>Enviados à igreja</h2>
  <div class="lista">${envios.map(e => `
    <button class="item" data-acao="menuEnvio" data-id="${esc(e.id)}">
      <span class="ico" style="background:var(--verde-fundo);color:var(--verde)">${icone.sobe}</span>
      <span class="meio"><div class="t1">Enviado em ${dataCurta(e.dataHora)}</div><div class="t2">Dízimo ${fmt(e.dizimo)} · oferta ${fmt(e.oferta)}</div></span>
      <span class="val num">${fmt(num(e.dizimo) + num(e.oferta))}</span></button>`).join('')}
  </div>` : ''}`;
}

function folhaEnviar() {
  const c = calcular(S.dados, chaveMes());
  abrirFolha(`
    <h3>Enviar para a igreja</h3>
    <p class="muted pequeno">Confirme depois de fazer a transferência. Tudo o que está separado passa para "Enviados à igreja" e o total separado volta a zero.</p>
    <div class="card bancos">
      <div class="banco"><span>Dízimo</span><b class="num">${fmt(c.dizimoRes)}</b></div>
      <div class="banco"><span>Oferta</span><b class="num">${fmt(c.ofertaRes)}</b></div>
      <div class="banco"><span><b>Total</b></span><b class="num">${fmt(c.reservado)}</b></div>
    </div>
    <button class="btn" data-acao="confirmarEnvio">Confirmar envio</button>
    <button class="btn secundario" data-acao="fecharFolha">Cancelar</button>`);
}

function folhaMenuEnvio(id) {
  const e = S.dados.envios.find(x => String(x.id) === String(id)); if (!e) return;
  abrirFolha(`
    <h3>Enviado em ${dataCurta(e.dataHora)}</h3>
    <p class="muted pequeno">Dízimo ${fmt(e.dizimo)} · oferta ${fmt(e.oferta)}</p>
    <button class="menu-op perigo" data-acao="desfazerEnvio" data-id="${esc(id)}">${icone.lixo} Desfazer envio (os valores voltam a ficar reservados)</button>
    <button class="btn secundario" data-acao="fecharFolha">Fechar</button>`);
}

/* ---------- A RECEBER ---------- */
function telaReceber() {
  const d = S.dados;
  const c = calcular(d, chaveMes());
  const lanc = id => d.lancamentos.find(l => String(l.id) === String(id));
  const abertos = d.receber.filter(r => r.status !== 'Recebido');
  const porDevedor = {};
  abertos.forEach(r => (porDevedor[r.devedor] = porDevedor[r.devedor] || []).push(r));
  const nomes = Object.keys(porDevedor).sort((a, b) => (a === 'Igreja' ? -1 : b === 'Igreja' ? 1 : a.localeCompare(b)));
  const recebidos = d.receber.filter(r => r.status === 'Recebido')
    .sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm))).slice(0, 20);
  const totIgreja = r2((porDevedor.Igreja || []).reduce((s, r) => s + num(r.valor), 0));

  const item = (r, comQuem) => {
    const l = lanc(r.lancamentoId);
    const nome = (comQuem ? (r.devedor === 'Igreja' ? 'Igreja' : r.devedor) + ' · ' : '') + (l ? (l.descricao || l.categoria) : 'Saída');
    const igreja = r.devedor === 'Igreja';
    const tag = r.status === 'Recebido' ? `<span class="tag-st ok">recebido ${dataCurta(r.atualizadoEm || r.dataHora)}</span>`
      : igreja ? `<span class="tag-st ${r.status === 'Nota enviada' ? 'env' : ''}">${r.status === 'Nota enviada' ? 'nota enviada' : 'nota pendente'}</span>` : '';
    return `<button class="item" data-acao="itemReceber" data-id="${esc(r.id)}">
      <span class="meio">
        <div class="t1">${esc(nome)}${r._pendente ? '<span class="tag-pend">enviando</span>' : ''}</div>
        <div class="t2">${[r.registro ? 'Nº ' + r.registro : '', dataCurta(r.dataHora), l ? 'pago ' + fmt(l.valor) : ''].filter(Boolean).map(esc).join(' · ')} ${tag}</div>
      </span>
      <span class="val num">${fmt(r.valor)}</span></button>`;
  };

  if (d.versao < 3) return `
  ${cabecalho('A receber', { voltar: S.origem })}
  <div class="card dica">${icone.dica}<div><b>Atualize o código da planilha</b><br>Para usar esta parte, cole o novo <b>apps-script/Codigo.gs</b> no Apps Script e publique uma nova versão (veja "Manutenção" no README).</div></div>`;

  return `
  ${cabecalho('A receber', { voltar: S.origem })}
  <section class="heroi">
    <div class="rotulo">Total a receber</div>
    <div class="valor-grande num">${fmt(c.aReceber)}</div>
    <div class="rodape">
      <div class="mes-saldo"><span>Reembolsos da igreja</span><b class="num">${fmt(totIgreja)}</b></div>
      <div class="mes-saldo" style="text-align:right"><span>Pessoas</span><b class="num">${fmt(r2(c.aReceber - totIgreja))}</b></div>
    </div>
  </section>
  <p class="muted pequeno" style="margin:10px 2px 0">Já saiu da carteira, não conta como seu gasto e entra no saldo total. Quando receber, o valor volta para a carteira.</p>

  ${nomes.length ? nomes.map(n => {
    const rs = porDevedor[n].sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)));
    const tot = r2(rs.reduce((s, r) => s + num(r.valor), 0));
    return `
  <div class="h2-linha"><h2>${n === 'Igreja' ? 'Reembolsos da igreja' : esc(n)} · ${fmt(tot)}</h2>
    <button class="link-btn" data-acao="mudarReceber" data-status="Recebido" data-ids="${esc(rs.map(r => r.id).join(','))}">Recebi tudo</button></div>
  <div class="lista">${rs.map(r => item(r)).join('')}</div>`;
  }).join('') : `<div class="card vazio" style="margin-top:14px">Nada a receber. Ao registrar uma saída, ligue "Receber de volta".</div>`}

  ${recebidos.length ? `
  <h2>Recebidos</h2>
  <div class="lista">${recebidos.map(r => item(r, true)).join('')}</div>` : ''}`;
}

function folhaItemReceber(id) {
  const r = S.dados.receber.find(x => String(x.id) === String(id)); if (!r) return;
  const l = S.dados.lancamentos.find(x => String(x.id) === String(r.lancamentoId));
  const igreja = r.devedor === 'Igreja';
  const op = (st, txt, cls = '') => `<button class="menu-op ${cls}" data-acao="mudarReceber" data-status="${st}" data-ids="${esc(r.id)}">${txt}</button>`;
  let acoes = '';
  if (r.status === 'Recebido') acoes = op(igreja ? 'Nota enviada' : 'Pendente', `${icone.esq} Desfazer: ainda não recebi`, 'perigo');
  else {
    acoes = op('Recebido', `${icone.sobe} Recebi ${fmt(r.valor)}`);
    if (igreja) acoes += r.status === 'Nota enviada' ? op('Pendente', `${icone.esq} Voltar para nota pendente`) : op('Nota enviada', `${icone.lista} Enviei a nota para a igreja`);
  }
  abrirFolha(`
    <h3>${igreja ? 'Reembolso da igreja' : esc(r.devedor)} · ${fmt(r.valor)}</h3>
    <p class="muted pequeno" style="margin:0 0 6px">${l ? esc(l.descricao || l.categoria) + ' · pago ' + fmt(l.valor) + ' em ' + dataCurta(l.dataHora) : ''}${r.registro ? ' · Nº ' + esc(r.registro) : ''}</p>
    ${acoes}
    ${l ? `<button class="menu-op" data-acao="editarLanc" data-id="${esc(l.id)}">${icone.lapis} Editar a saída</button>` : ''}
    <button class="btn secundario" data-acao="fecharFolha">Fechar</button>`);
}

/* ---------- MAIS OPÇÕES (menu ☰) ---------- */
function menuHtml() {
  const d = S.dados;
  const item = (titulo, sub, direita) => `
    <div class="ajuste-item"><div><b>${titulo}</b><div class="muted pequeno">${sub}</div></div>${direita}</div>`;
  return `
  <div class="menu-cab"><b>Mais opções</b><button class="btn-redondo" style="border:0;background:none" data-acao="fecharFolha" aria-label="Fechar">${icone.x}</button></div>

  <div class="secao">Aparência</div>
  <div class="card secao-card">
    ${item('Tema escuro', 'Troca as cores do app', `<button class="interruptor ${S.tema === 'escuro' ? 'on' : ''}" data-acao="tema" aria-label="Tema escuro"></button>`)}
  </div>

  <div class="secao">Carteira</div>
  <div class="card secao-card">
    ${item('Saldo inicial', 'O que você tinha ao começar', `<button class="chip pequeno" data-acao="editarSaldoInicial">${fmt(num(d.config.saldoInicial))}</button>`)}
  </div>

  <div class="secao">Segurança</div>
  <div class="card secao-card">
    ${item('Pedir PIN ao abrir', 'Se desligado, este aparelho lembra o PIN', `<button class="interruptor ${S.pedirPin ? 'on' : ''}" data-acao="pedirPin" aria-label="Pedir PIN ao abrir"></button>`)}
    ${item('Bloquear agora', 'Pede o PIN para abrir de novo', '<button class="chip pequeno" data-acao="bloquear">Bloquear</button>')}
  </div>

  <div class="secao">Este aparelho</div>
  <div class="card secao-card">
    ${item('Link para o celular', 'Abre o app já ligado à planilha (o PIN continua sendo pedido)', '<button class="chip pequeno" data-acao="copiarLink">Copiar</button>')}
    ${item('Atualizar dados', 'Busca tudo da planilha de novo', '<button class="chip pequeno" data-acao="recarregar">Atualizar</button>')}
    ${item('Desconectar', 'Remove o link e o PIN deste aparelho. Seus dados continuam na planilha.', '<button class="chip pequeno" data-acao="trocarPlanilha" style="color:var(--vermelho)">Sair</button>')}
  </div>
  <p class="muted pequeno" style="text-align:center;margin-top:20px">HRM Finance · versão ${VERSAO_APP}</p>`;
}
function atualizarMenu() {
  const f = $('#folha');
  if (!f.hidden && f.classList.contains('lateral')) f.innerHTML = menuHtml();
}

function folhaCategoria(tipo) {
  const usadas = new Set(S.dados.categorias.map(c => c.cor));
  const corInicial = CORES.find(c => !usadas.has(c)) || CORES[0];
  abrirFolha(`
    <h3>Nova categoria de ${tipo === 'Saída' ? 'saída' : 'entrada'}</h3>
    <label class="rotulo-campo" for="inNomeCat">Nome</label>
    <input id="inNomeCat" class="campo" placeholder="${tipo === 'Saída' ? 'Ex.: Saúde, Educação, Moradia' : 'Ex.: Freelance'}" autocomplete="off">
    <span class="rotulo-campo">Cor</span>
    <div class="cores" id="cores">${CORES.map(c => `<button class="${c === corInicial ? 'on' : ''}" style="background:${c}" data-acao="corCat" data-cor="${c}" aria-label="Cor ${c}"></button>`).join('')}</div>
    <button class="btn" data-acao="salvarCat" data-tipo="${esc(tipo)}">Criar categoria</button>
    <button class="btn secundario" data-acao="fecharFolha">Cancelar</button>`, () => $('#inNomeCat').focus());
}

function folhaSaldoInicial() {
  const v = num(S.dados.config.saldoInicial);
  abrirFolha(`
    <h3>Saldo inicial</h3>
    <p class="muted pequeno">É o valor que você tinha disponível quando começou a usar o app. Mudar este número ajusta o "Na carteira".</p>
    <div class="valor-entrada"><input id="inIniAj" data-dinheiro inputmode="numeric" placeholder="R$ 0,00" autocomplete="off"
      data-centavos="${Math.round(v * 100)}" value="${v ? fmt(v) : ''}"></div>
    <button class="btn" data-acao="salvarSaldoInicial">Salvar</button>
    <button class="btn secundario" data-acao="fecharFolha">Cancelar</button>`, () => $('#inIniAj').focus());
}

/* ---------- ações (cliques) ---------- */
const centavosDe = el => (el && +el.dataset.centavos) || 0;

const ACOES = {
  /* entrada no app */
  async conectar() {
    let url = $('#inUrl').value.trim();
    const pin = $('#inPin').value.trim();
    if (!/^https:\/\/script\.google\.com\//.test(url)) return avisar('Cole o link do App da Web (começa com https://script.google.com/).', true);
    if (!/\/exec$/.test(url)) return avisar('O link deve terminar em /exec.', true);
    if (!pin) return avisar('Digite o seu PIN.', true);
    marcarOcupado(true);
    try {
      const d = await chamar('carregar', {}, pin, url);
      S.url = url; lsSet('hrm_url', url);
      S.pin = pin; guardarPin();
      receber(d);
      S.view = 'painel';
      render();
      avisar('Conectado à planilha!');
    } catch (e) { avisar(e.message, true); }
    finally { marcarOcupado(false); }
  },
  tecla(el) {
    const t = el.dataset.t;
    if (t === '<') S.pinDig = S.pinDig.slice(0, -1);
    else if (S.pinDig.length < 8) S.pinDig += t;
    telaPin();
  },
  async entrarPin() {
    if (!S.pinDig) return avisar('Digite o PIN.', true);
    marcarOcupado(true);
    try {
      const d = await chamar('carregar', {}, S.pinDig);
      S.pin = S.pinDig; S.pinDig = ''; guardarPin();
      receber(d);
      S.status = 'ok';
      render();
      processarFila();
    } catch (e) {
      S.pinDig = '';
      telaPin();
      const p = $('#pontos'); if (p) p.classList.add('treme');
      avisar(e.pin ? 'PIN incorreto.' : e.message, true);
    } finally { marcarOcupado(false); }
  },
  tentarDeNovo() { S.erroCarga = ''; render(); atualizar(); },
  trocarPlanilha() {
    if (S.fila.length && !confirm('Há lançamentos ainda não enviados neste aparelho. Sair mesmo assim? Eles serão perdidos.')) return;
    if (!S.fila.length && S.dados && !confirm('Desconectar este aparelho da planilha?')) return;
    esquecerPin();
    S.url = ''; S.base = null; S.dados = null; S.fila = []; S.pinDig = ''; S.erroCarga = '';
    ['hrm_url', 'hrm_dados', 'hrm_fila'].forEach(lsDel);
    fecharFolha();
    render();
  },
  async saldoInicialOk() {
    const v = centavosDe($('#inIni')) / 100;
    if (await executar('setConfig', { chave: 'saldoInicial', valor: v }, 'Tudo pronto!')) { S.view = 'painel'; render(); }
  },
  async saldoInicialZero() {
    if (await executar('setConfig', { chave: 'saldoInicial', valor: 0 }, 'Tudo pronto!')) { S.view = 'painel'; render(); }
  },

  /* navegação */
  mes(el) {
    S.mes = mudaMes(S.mes, +el.dataset.delta);
    if (S.mes > chaveMes()) S.mes = chaveMes();
    if (S.filtro.startsWith('cat:')) S.filtro = 'todos';
    render();
  },
  filtro(el) { S.filtro = el.dataset.f; const l = $('#fluxoLista'); if (l) { l.innerHTML = listaFluxo(); $$('[data-acao="filtro"]').forEach(b => b.classList.toggle('on', b.dataset.f === S.filtro)); } else render(); },
  fecharFolha() { fecharFolha(); },

  /* lançamentos */
  tipo(el) {
    if (S.form.tipo === el.dataset.tipo) return;
    S.form.tipo = el.dataset.tipo; S.form.categoria = null; S.form.catManual = false;
    render();
    sugerirCategoria(S.form.descricao);
  },
  cat(el) { S.form.categoria = el.dataset.nome; S.form.catManual = true; marcarChips(); if (S.form.tipo === 'Entrada') atualizarCaixaDizimar(); },
  pag(el) { S.form.pagamento = el.dataset.nome; marcarChips(); },
  async salvarLanc() {
    const f = S.form;
    if (!f.centavos) { avisar('Informe o valor.', true); const i = $('#inValor'); if (i) i.focus(); return; }
    if (!f.categoria) return avisar('Escolha uma categoria.', true);
    const dados = {
      id: f.id || uid(), dataHora: f.dataHora || isoLocal(), tipo: f.tipo, valor: f.centavos / 100,
      categoria: f.categoria, pagamento: f.tipo === 'Saída' ? f.pagamento : '', descricao: f.descricao.trim()
    };
    if (f.tipo === 'Saída') lsSet('hrm_ultimo_pag', f.pagamento);
    const comDizimo = f.tipo === 'Entrada' && S.dados.versao >= 2 && !f.sepEnviada;
    const dizimo = comDizimo && liga(f, 'dizimo'), ofertar = comDizimo && liga(f, 'oferta');
    if (comDizimo) { const pref = lsGet('hrm_separar', {}); pref[f.categoria] = { dizimo, oferta: ofertar }; lsSet('hrm_separar', pref); }
    // Dízimo e oferta montados aqui para o lançamento funcionar mesmo sem internet
    const montarSeps = antes => [['Dízimo', dizimo ? dizimoDe(dados.valor) : 0], ['Oferta', ofertar ? r2(ofertaDe(f)) : 0]]
      .filter(([, v]) => v > 0)
      .map(([parte, v]) => ({ id: ((antes || []).find(x => x.parte === parte) || {}).id || uid(), dataHora: dados.dataHora, tipo: 'Saída',
        valor: v, categoria: CAT_DIZIMO, pagamento: 'Pix', descricao: parte + ' · ' + (dados.descricao || dados.categoria),
        origemId: dados.id, parte }));
    if ((dizimo || ofertar) && !f.id) dados.separacoes = montarSeps();

    const comReceber = f.tipo === 'Saída' && S.dados.versao >= 3 && !f.receber.travado;
    if (comReceber && f.receber.modo === 'escolher') return avisar('Escolha Reembolso ou Valor dividido, ou desligue "Receber de volta".', true);
    if (comReceber && f.receber.modo === 'dividir') {
      const ps = f.receber.pessoas;
      if (!ps.length) return avisar('Adicione quem vai te pagar.', true);
      if (ps.some(p => !p.nome.trim())) return avisar('Digite o nome de cada pessoa.', true);
      if (ps.some(p => !p.centavos)) return avisar('Informe quanto cada pessoa vai te pagar.', true);
      if (ps.reduce((s, p) => s + p.centavos, 0) > f.centavos) return avisar('O valor a receber é maior que o valor pago.', true);
    }
    const recAntes = f.id ? S.dados.receber.filter(r => String(r.lancamentoId) === String(f.id)) : [];
    if (comReceber && f.receber.modo !== 'nao' && !f.id) dados.receber = montarReceber(f);

    if (!f.id) {
      enfileirar({ acao: 'addLancamento', dados });
      if (f.compromissoId) enfileirar({ acao: 'pagarCompromisso', dados: { id: f.compromissoId, lancamentoId: dados.id, dataHora: dados.dataHora } });
      avisar(f.tipo === 'Saída' ? `Saída de ${fmt(dados.valor)} registrada${dados.receber ? ` · ${fmt(dados.receber.reduce((s, r) => s + r.valor, 0))} a receber` : ''}${avisoOrcamento(dados.categoria, dados.dataHora.slice(0, 7))}`
        : `Entrada de ${fmt(dados.valor)} registrada${dados.separacoes ? ` · ${fmt(dados.separacoes.reduce((s, x) => s + x.valor, 0))} separado para a igreja` : ''}`);
      S.form = null; S.view = 'painel'; S.mes = dados.dataHora.slice(0, 7);
      render(); window.scrollTo(0, 0);
      processarFila();
      return;
    }
    const pend = S.fila.find(x => x.acao === 'addLancamento' && x.dados.id === f.id);
    if (pend) {
      if (dizimo || ofertar) dados.separacoes = montarSeps(pend.dados.separacoes);
      if (comReceber && f.receber.modo !== 'nao') dados.receber = montarReceber(f, pend.dados.receber);
      pend.dados = dados; salvarFila();
      avisar('Lançamento atualizado');
      S.form = null; S.view = 'fluxo'; render(); processarFila();
      return;
    }
    if (comDizimo || f.temSep) { dados.dizimo = dizimo; dados.oferta = ofertar ? r2(ofertaDe(f)) : 0; }
    if (comReceber || (recAntes.length && !f.receber.travado)) dados.receber = f.tipo === 'Saída' ? montarReceber(f, recAntes) : [];
    if (await executar('editLancamento', dados, 'Lançamento atualizado')) { S.form = null; S.view = 'fluxo'; render(); }
  },
  async excluirLanc() {
    const f = S.form;
    if (!confirm('Excluir este lançamento?')) return;
    const i = S.fila.findIndex(x => x.acao === 'addLancamento' && x.dados.id === f.id);
    if (i >= 0) { S.fila.splice(i, 1); salvarFila(); avisar('Lançamento excluído'); S.form = null; S.view = 'fluxo'; render(); return; }
    if (await executar('delLancamento', { id: f.id }, 'Lançamento excluído')) { S.form = null; S.view = 'fluxo'; render(); }
  },
  cancelarEdicao() { S.form = null; S.view = 'fluxo'; render(); },
  editarLanc(el) {
    let l = S.dados.lancamentos.find(x => String(x.id) === el.dataset.id);
    if (!l) return;
    fecharFolha();
    if (ehSeparacao(l)) {
      // Dízimo e oferta seguem a entrada: para mudar, edita-se a entrada
      const o = S.dados.lancamentos.find(x => String(x.id) === String(l.origemId));
      if (!o || l.envioId) { S.view = 'dizimos'; render(); window.scrollTo(0, 0); return avisar(l.envioId ? 'Este dízimo já foi enviado à igreja.' : 'A entrada deste dízimo não existe mais.'); }
      avisar('O dízimo e a oferta seguem a entrada: mude-os aqui.');
      l = o;
    }
    const seps = S.dados.lancamentos.filter(x => ehSeparacao(x) && String(x.origemId) === String(l.id));
    const oferta = seps.find(x => x.parte === 'Oferta'), ent = l.tipo === 'Entrada';
    S.form = { id: l.id, tipo: l.tipo, centavos: Math.round(num(l.valor) * 100), categoria: l.categoria, catManual: true,
      pagamento: l.pagamento || 'Pix', descricao: l.descricao || '', dataHora: l.dataHora,
      dizimo: ent ? seps.some(x => x.parte === 'Dízimo') : null, oferta: ent ? !!oferta : null,
      temSep: seps.length > 0, sepEnviada: seps.some(x => x.envioId),
      ofertaCentavos: oferta ? Math.round(num(oferta.valor) * 100) : 0, ofertaManual: !!oferta,
      receber: receberDoForm(l) };
    S.view = 'lancar';
    render(); window.scrollTo(0, 0);
  },

  /* dízimos e ofertas */
  alternarSep(el) { const p = el.dataset.parte; S.form[p] = !liga(S.form, p); atualizarCaixaDizimar(); },
  abrirDizimos() { irPara('dizimos'); },
  abrirReceber() { irPara('receber'); },
  abrirCompromissos() { irPara('compromissos'); },
  abrirCofrinhos() { irPara('economias'); },
  editarOrcamento() { folhaOrcamento(); },
  async salvarOrcamento() {
    const lim = {};
    $$('[data-limite]').forEach(i => { const c = +i.dataset.centavos || 0; if (c) lim[i.dataset.limite] = c / 100; });
    if (await executar('setConfig', { chave: 'orcamento', valor: JSON.stringify(lim) }, 'Limites salvos')) { fecharFolha(); render(); }
  },
  novoCompromisso() { folhaCompromisso(null); },
  editarCompromisso(el) { folhaCompromisso(el.dataset.id); },
  menuCompromisso(el) { folhaMenuCompromisso(el.dataset.id); },
  compCat(el) { const on = !el.classList.contains('on'); $$('#compCats .chip').forEach(b => b.classList.remove('on')); el.classList.toggle('on', on); },
  compMensal(el) { el.classList.toggle('on'); },
  async salvarCompromisso(el) {
    const id = el.dataset.id;
    const dados = {
      id: id || uid(), descricao: $('#inCompDesc').value.trim(), valor: centavosDe($('#inCompValor')) / 100,
      vencimento: $('#inCompData').value, categoria: ($('#compCats .chip.on') || { dataset: {} }).dataset.nome || '',
      repete: $('#compMensal').classList.contains('on') ? 'Mensal' : 'Não'
    };
    if (!dados.descricao) return avisar('Descreva o compromisso.', true);
    if (!dados.vencimento) return avisar('Informe a data do vencimento.', true);
    if (await executar(id ? 'editCompromisso' : 'addCompromisso', dados, id ? 'Compromisso atualizado' : 'Compromisso criado')) { fecharFolha(); render(); }
  },
  async excluirCompromisso(el) {
    if (!confirm('Excluir este compromisso?')) return;
    if (await executar('delCompromisso', { id: el.dataset.id }, 'Compromisso excluído')) { fecharFolha(); render(); }
  },
  pagarCompromisso(el) {
    const c = S.dados.compromissos.find(x => String(x.id) === String(el.dataset.id)); if (!c) return;
    fecharFolha();
    S.form = { ...novoForm(), centavos: Math.round(num(c.valor) * 100), descricao: c.descricao,
      categoria: c.categoria || null, catManual: !!c.categoria, compromissoId: c.id };
    S.view = 'lancar'; render(); window.scrollTo(0, 0);
    avisar('Confira o valor e registre a saída.');
  },
  ligarReceber() {
    const rc = S.form.receber;
    rc.modo = rc.modo === 'nao' ? 'escolher' : 'nao';
    atualizarCaixaReceber();
  },
  modoReceber(el) {
    const rc = S.form.receber;
    rc.modo = el.dataset.modo;
    if (rc.modo === 'dividir' && !rc.pessoas.length) { rc.pessoas = [{ nome: '', centavos: 0 }]; rc.manual = false; dividirIgual(S.form); }
    atualizarCaixaReceber();
    const n = $('[data-rec-nome="0"]'); if (n && !n.value) n.focus();
  },
  maisPessoa() {
    const rc = S.form.receber;
    rc.pessoas.push({ nome: '', centavos: 0 }); rc.manual = false; dividirIgual(S.form);
    atualizarCaixaReceber();
    const n = $(`[data-rec-nome="${rc.pessoas.length - 1}"]`); if (n) n.focus();
  },
  tirarPessoa(el) {
    const rc = S.form.receber;
    rc.pessoas.splice(+el.dataset.i, 1);
    if (!rc.pessoas.length) rc.modo = 'escolher';
    rc.manual = false; dividirIgual(S.form);
    atualizarCaixaReceber();
  },
  itemReceber(el) { folhaItemReceber(el.dataset.id); },
  async mudarReceber(el) {
    const ids = el.dataset.ids.split(',');
    const st = el.dataset.status;
    const msg = st === 'Recebido' ? 'Recebido! O valor voltou para a carteira' : st === 'Nota enviada' ? 'Nota marcada como enviada' : 'Situação atualizada';
    if (S.fila.length) return avisar('Espere os lançamentos pendentes subirem para a planilha.', true);
    if (await executar('statusReceber', { ids, status: st, dataHora: isoLocal() }, msg)) { fecharFolha(); render(); }
  },
  enviarIgreja() { folhaEnviar(); },
  async confirmarEnvio() {
    const v = calcular(S.dados, chaveMes()).reservado;
    if (S.fila.length) return avisar('Espere os lançamentos pendentes subirem para a planilha.', true);
    if (await executar('enviarIgreja', { id: uid(), dataHora: isoLocal() }, `${fmt(v)} enviado para a igreja`)) { fecharFolha(); render(); }
  },
  menuEnvio(el) { folhaMenuEnvio(el.dataset.id); },
  async desfazerEnvio(el) {
    if (!confirm('Desfazer este envio? Os valores voltam a ficar reservados.')) return;
    if (await executar('desfazerEnvio', { id: el.dataset.id }, 'Envio desfeito')) { fecharFolha(); render(); }
  },

  /* categorias */
  novaCat(el) { folhaCategoria(el.dataset.tipo); },
  corCat(el) { $$('#cores button').forEach(b => b.classList.toggle('on', b === el)); },
  async salvarCat(el) {
    const nome = $('#inNomeCat').value.trim();
    const corEl = $('#cores button.on');
    if (!nome) return avisar('Digite o nome da categoria.', true);
    const tipo = el.dataset.tipo;
    if (await executar('addCategoria', { tipo, nome, cor: corEl ? corEl.dataset.cor : CORES[0] }, 'Categoria criada')) {
      fecharFolha();
      if (S.view === 'lancar' && S.form && S.form.tipo === tipo) { S.form.categoria = nome; S.form.catManual = true; }
      render();
    }
  },
  async delCat(el) {
    const { tipo, nome } = el.dataset;
    if (!confirm(`Remover a categoria "${nome}"? Os lançamentos antigos continuam com esse nome.`)) return;
    if (await executar('delCategoria', { tipo, nome }, 'Categoria removida')) { fecharFolha(); render(); }
  },

  /* cofrinhos */
  novoCofre() { folhaCofre(null); },
  editarCofre(el) { folhaCofre(el.dataset.id); },
  menuCofre(el) { folhaMenuCofre(el.dataset.id); },
  verMovs(el) { folhaMovimentos(el.dataset.id); },
  bancoChip(el) { $('#inBanco').value = el.dataset.nome; },
  async salvarCofre(el) {
    const id = el.dataset.id;
    const nome = $('#inNomeCofre').value.trim();
    const banco = $('#inBanco').value.trim();
    const meta = centavosDe($('#inMeta')) / 100;
    if (!nome) return avisar('Dê um nome ao cofrinho.', true);
    const ok = id
      ? await executar('editCofrinho', { id, nome, banco, meta }, 'Cofrinho atualizado')
      : await executar('addCofrinho', { id: uid(), nome, banco, meta, saldoInicial: centavosDe($('#inSaldoCofre')) / 100 }, 'Cofrinho criado');
    if (ok) { fecharFolha(); render(); }
  },
  async excluirCofre(el) {
    const id = el.dataset.id, cf = acharCofre(id);
    if (saldoDoCofre(id) > 0.004) return avisar('Resgate o saldo antes de excluir o cofrinho.', true);
    if (!confirm(`Excluir o cofrinho "${cf ? cf.nome : ''}"?`)) return;
    if (await executar('delCofrinho', { id }, 'Cofrinho excluído')) { fecharFolha(); render(); }
  },
  movCofre(el) { folhaMov(el.dataset.id, el.dataset.tipo); },
  resgatarTudo(el) {
    const i = $('#inMov'); const c = Math.round(num(el.dataset.valor) * 100);
    i.dataset.centavos = c; i.value = fmt(c / 100);
  },
  async confirmarMov(el) {
    const { id, tipo } = el.dataset;
    const v = centavosDe($('#inMov')) / 100;
    if (!v) return avisar('Informe o valor.', true);
    if (tipo === 'Resgatar' && v > saldoDoCofre(id) + 0.004) return avisar('O cofrinho não tem esse valor.', true);
    if (tipo === 'Guardar' && v > calcular(S.dados, chaveMes()).carteira + 0.004
      && !confirm('Esse valor é maior que o disponível na carteira. Guardar mesmo assim?')) return;
    if (await executar('movCofrinho', { cofrinhoId: id, tipo, valor: v, dataHora: isoLocal() },
      tipo === 'Guardar' ? `${fmt(v)} guardado` : `${fmt(v)} resgatado`)) { fecharFolha(); render(); }
  },
  atualizarCofre(el) { folhaAtualizar(el.dataset.id); },
  async confirmarAtualizar(el) {
    const id = el.dataset.id;
    const novo = centavosDe($('#inSaldoNovo')) / 100;
    const dif = r2(novo - saldoDoCofre(id));
    if (dif === 0) { fecharFolha(); return avisar('O saldo já estava em dia.'); }
    if (await executar('atualizarSaldo', { cofrinhoId: id, novoSaldo: novo, dataHora: isoLocal() },
      dif > 0 ? `Rendeu ${fmt(dif)}` : 'Saldo atualizado')) { fecharFolha(); render(); }
  },

  /* orçamentos */
  abaOrc(el) { S.abaOrc = el.dataset.aba; render(); },
  catOrc(el) { folhaCatOrc(el.dataset.nome); },
  catEnt(el) { folhaCatEnt(el.dataset.nome); },
  async salvarLimCat(el) {
    const lim = orcamento(), nome = el.dataset.nome, c = centavosDe($('#inLimCat'));
    if (c) lim[nome] = c / 100; else delete lim[nome];
    if (await executar('setConfig', { chave: 'orcamento', valor: JSON.stringify(lim) }, c ? `Limite de ${fmt(c / 100)} salvo` : 'Limite removido')) { fecharFolha(); render(); }
  },

  /* análise */
  per(el) { S.per = el.dataset.per; if (S.per === 'ano' && S.refAn.slice(0, 4) === chaveMes().slice(0, 4)) S.refAn = chaveMes(); render(); },
  cmp(el) { S.cmp = el.dataset.cmp; render(); },
  refAn(el) {
    const passo = PERIODOS[S.per][1] * +el.dataset.delta;
    S.refAn = mudaMes(S.refAn, passo);
    if (S.refAn > chaveMes()) S.refAn = chaveMes();
    render();
  },
  pdf() { gerarPdf(); },

  /* mais opções */
  editarSaldoInicial() { folhaSaldoInicial(); },
  async salvarSaldoInicial() {
    const v = centavosDe($('#inIniAj')) / 100;
    if (await executar('setConfig', { chave: 'saldoInicial', valor: v }, 'Saldo inicial atualizado')) { fecharFolha(); render(); }
  },
  pedirPin() {
    S.pedirPin = !S.pedirPin;
    lsSet('hrm_pedir_pin', S.pedirPin);
    guardarPin();
    atualizarMenu();
    avisar(S.pedirPin ? 'O PIN será pedido ao abrir o app' : 'Este aparelho vai lembrar o PIN');
  },
  bloquear() { fecharFolha(); esquecerPin(); S.pinDig = ''; render(); },
  menu() { abrirFolha(menuHtml(), null, true); },
  tema() { S.tema = S.tema === 'escuro' ? 'claro' : 'escuro'; lsSet('hrm_tema', S.tema); aplicarTema(); atualizarMenu(); },
  async copiarLink() {
    const link = `${location.origin}${location.pathname}#conectar=${encodeURIComponent(S.url)}`;
    try { await navigator.clipboard.writeText(link); avisar('Link copiado! Envie para o seu celular.'); }
    catch { prompt('Copie este link e abra no celular:', link); }
  },
  recarregar() { atualizar(true); }
};

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  const v = e.target.closest('[data-view]');
  if (v && !v.closest('#folha')) {
    if (v.dataset.view === 'lancar' || v.dataset.view !== S.view || S.form) irPara(v.dataset.view);
    return;
  }
  const el = e.target.closest('[data-acao]');
  if (!el || el.disabled) return;
  const fn = ACOES[el.dataset.acao];
  if (fn) { e.preventDefault(); fn(el, e); }
});

$('#folhaFundo').addEventListener('click', () => fecharFolha());
window.addEventListener('popstate', () => { if (folhaAberta()) fecharFolha(true); });

document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('[data-dinheiro]')) {
    const dig = t.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11);
    const c = dig ? parseInt(dig, 10) : 0;
    t.dataset.centavos = c;
    t.value = c ? fmt(c / 100) : '';
  }
  const campo = t.dataset.campo;
  if (campo && S.form && S.view === 'lancar') {
    if (campo === 'centavos') { S.form.centavos = +t.dataset.centavos || 0; atualizarPrevDizimo(); atualizarTextosReceber(); }
    else if (campo === 'dataHora') S.form.dataHora = t.value ? t.value + ':00' : null;
    else S.form[campo] = t.value;
  }
  if (t.id === 'inDesc') sugerirCategoria(t.value);
  if (t.id === 'inSaldoNovo') atualizarDif();
  if (t.id === 'inBusca') { S.busca = t.value; const l = $('#fluxoLista'); if (l) l.innerHTML = listaFluxo(); }
  if (t.dataset.recNome !== undefined && S.form) S.form.receber.pessoas[+t.dataset.recNome].nome = t.value;
  if (t.dataset.recValor !== undefined && S.form) {
    S.form.receber.pessoas[+t.dataset.recValor].centavos = +t.dataset.centavos || 0;
    S.form.receber.manual = true; atualizarTextosReceber();
  }
  if (t.id === 'inOferta' && S.form) { S.form.ofertaCentavos = +t.dataset.centavos || 0; S.form.ofertaManual = true; atualizarPrevDizimo(); }
});

document.addEventListener('keydown', e => {
  // Teclado físico na tela do PIN (computador)
  if (S.url && !S.pin && !$('#inPin')) {
    if (/^\d$/.test(e.key)) ACOES.tecla({ dataset: { t: e.key } });
    else if (e.key === 'Backspace') ACOES.tecla({ dataset: { t: '<' } });
    else if (e.key === 'Enter') ACOES.entrarPin();
    return;
  }
  // Enter para salvar
  if (e.key === 'Enter' && e.target.matches('input') && !e.target.matches('[list]')) {
    const botao = (folhaAberta() ? $('#folha') : $('#tela')).querySelector('.btn:not(.secundario):not(.perigo)');
    if (botao) { e.preventDefault(); e.target.blur(); botao.click(); }
  }
});

window.addEventListener('online', () => { S.status = 'ok'; processarFila(); atualizar(); });
window.addEventListener('offline', () => { S.status = 'offline'; atualizarSync(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') atualizar(); });
setInterval(() => { if (S.fila.length) processarFila(); }, 30000);

/* ---------- início ---------- */
(function iniciar() {
  const m = location.hash.match(/conectar=([^&]+)/);
  if (m) {
    try { S.urlSugerida = decodeURIComponent(m[1]); } catch { }
    history.replaceState(null, '', location.pathname + location.search);
  }
  aplicarTema();
  S.base = normalizarBase(S.base);
  recalcular();
  render();
  if (S.url && S.pin) atualizar();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
})();
