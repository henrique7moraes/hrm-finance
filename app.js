'use strict';
/* HRM Finance — app de controle financeiro pessoal
   Dados: Google Sheets (via Apps Script). Telas: este arquivo. */

const VERSAO_APP = '1.0';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRL_CURTO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const r2 = v => Math.round((+v || 0) * 100) / 100;
const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmt = v => BRL.format(r2(v));
const fmtCurto = v => Math.abs(v) >= 10000 ? BRL_CURTO.format(v) : fmt(v);
const sinal = v => (v > 0.004 ? '+' : v < -0.004 ? '−' : '') + fmt(Math.abs(v));

const PAGAMENTOS = ['Pix', 'Débito', 'Dinheiro'];
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
    movimentos: d.movimentos || [], config: d.config || {}
  };
}
function mesclarFila(base) {
  if (!base) return null;
  const d = { ...base, lancamentos: base.lancamentos.slice() };
  const ids = new Set(d.lancamentos.map(l => String(l.id)));
  for (const f of S.fila) {
    if (f.acao === 'addLancamento' && !ids.has(String(f.dados.id))) d.lancamentos.push({ ...f.dados, _pendente: true });
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
function calcular(d, mes) {
  const ini = num(d.config.saldoInicial);
  let ent = 0, sai = 0, entMes = 0, saiMes = 0;
  const porCat = {};
  for (const l of d.lancamentos) {
    const v = num(l.valor);
    const noMes = String(l.dataHora).slice(0, 7) === mes;
    if (l.tipo === 'Entrada') { ent += v; if (noMes) entMes += v; }
    else { sai += v; if (noMes) { saiMes += v; porCat[l.categoria] = (porCat[l.categoria] || 0) + v; } }
  }
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
  const carteira = r2(ini + ent - sai - guard + resg);
  const totalCofres = r2(d.cofrinhos.reduce((s, c) => s + (saldoCofre[String(c.id)] || 0), 0));
  return {
    carteira, totalCofres, total: r2(carteira + totalCofres),
    entMes: r2(entMes), saiMes: r2(saiMes), saldoMes: r2(entMes - saiMes),
    guardadoMes: r2(guardMes - resgMes), rendMes: r2(rendMes),
    porCat, saldoCofre, rendCofreMes
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
  $('#topo').hidden = !v;
  $('#nav').hidden = !v;
}

function abrirFolha(html, aoAbrir) {
  const f = $('#folha');
  f.innerHTML = html;
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
  dica: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z"/></svg>'
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
  const views = { painel, historico, lancar, economias, ajustes };
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

function irPara(view) {
  fecharFolha();
  S.view = view;
  if (view === 'lancar') S.form = novoForm();
  if (view === 'painel' || view === 'historico') { /* mantém o mês escolhido */ }
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
    <p>Informe o valor disponível agora para usar (conta e dinheiro em mãos). Não inclua o que está guardado em cofrinhos: eles você cria depois, na aba Economias.</p>
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
  const extras = [l.descricao ? l.categoria : '', l.pagamento, hora(l.dataHora)].filter(Boolean).map(esc).join(' · ');
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

function rosca(porCat, total) {
  const itens = Object.entries(porCat).map(([nome, v]) => ({ nome, v, cor: corCat('Saída', nome) })).sort((a, b) => b.v - a.v);
  if (!itens.length || total <= 0) return `<div class="vazio">Nenhuma saída neste mês.</div>`;
  let lista = itens;
  if (itens.length > 6) {
    const resto = itens.slice(5).reduce((s, i) => s + i.v, 0);
    lista = [...itens.slice(0, 5), { nome: 'Outras', v: resto, cor: '#6B80A8' }];
  }
  const R = 52, C = 2 * Math.PI * R, gap = lista.length > 1 ? 2 : 0;
  let acc = 0;
  const segs = lista.map(i => {
    const fat = i.v / total * C;
    const len = Math.max(fat - gap, 0.6);
    const s = `<circle cx="66" cy="66" r="${R}" stroke="${i.cor}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 66 66)"/>`;
    acc += fat;
    return s;
  }).join('');
  return `
  <div class="grafico">
    <svg class="rosca" viewBox="0 0 132 132" aria-hidden="true">
      <circle cx="66" cy="66" r="${R}" stroke="rgba(127,184,240,.08)" stroke-width="18"/>
      ${segs}
      <text x="66" y="61" text-anchor="middle" fill="#9DB1D6" stroke="none" font-size="10" font-weight="600">Saídas</text>
      <text x="66" y="78" text-anchor="middle" fill="#EAF2FF" stroke="none" font-size="${fmtCurto(total).length > 11 ? 11 : 13}" font-weight="800">${esc(fmtCurto(total))}</text>
    </svg>
    <div class="legenda">
      ${lista.map(i => `<div><span class="bolinha" style="background:${i.cor}"></span><span class="nome">${esc(i.nome)}</span><span class="pct">${Math.round(i.v / total * 100)}%</span></div>`).join('')}
    </div>
  </div>`;
}

/* ---------- PAINEL ---------- */
function painel() {
  const d = S.dados;
  const c = calcular(d, S.mes);
  const recentes = d.lancamentos.slice().sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora))).slice(0, 5);
  const primeiraVez = !d.lancamentos.length && !d.cofrinhos.length;
  return `
  ${mesNav()}
  <section class="heroi">
    <div class="rotulo">Na carteira</div>
    <div class="valor-grande num">${fmt(c.carteira)}</div>
    <div class="rodape">
      <div class="mes-saldo"><span>Saldo de ${esc(nomeMes(S.mes, false))}</span><b class="num ${c.saldoMes >= 0 ? 'pos' : 'neg'}">${sinal(c.saldoMes)}</b></div>
      <div class="total">Saldo total<br><b class="num">${fmt(c.total)}</b></div>
    </div>
  </section>

  <div class="duplo">
    <div class="card mini">
      <div class="rotulo"><i class="i-ent">${icone.sobe}</i>Entradas</div>
      <div class="v num pos">${fmt(c.entMes)}</div>
    </div>
    <div class="card mini">
      <div class="rotulo"><i class="i-sai">${icone.desce}</i>Saídas</div>
      <div class="v num">${fmt(c.saiMes)}</div>
    </div>
  </div>
  <div class="card guardado"><span>Guardado no mês</span><b class="num">${sinal(c.guardadoMes)}</b></div>

  ${primeiraVez ? `
  <div class="card dica">${icone.dica}<div><b>Primeiros passos</b><br>Toque no <b>+</b> para registrar um gasto ou uma entrada. Seus cofrinhos você cria na aba <b>Economias</b>.</div></div>` : ''}

  <h2>Para onde foi o dinheiro</h2>
  <div class="card">${rosca(c.porCat, c.saiMes)}</div>

  <div class="h2-linha"><h2>Últimos lançamentos</h2>${recentes.length ? '<button class="link-btn" data-view="historico">Ver tudo</button>' : ''}</div>
  <div class="lista">${recentes.length ? recentes.map(itemLanc).join('') : '<div class="card vazio">Nenhum lançamento ainda.</div>'}</div>`;
}

/* ---------- HISTÓRICO ---------- */
function historico() {
  const d = S.dados;
  const doMes = d.lancamentos.filter(l => String(l.dataHora).slice(0, 7) === S.mes);
  const catsDoMes = [...new Set(doMes.map(l => l.tipo + '|' + l.categoria))];
  let lista = doMes;
  if (S.filtro.startsWith('tipo:')) lista = doMes.filter(l => l.tipo === S.filtro.slice(5));
  else if (S.filtro.startsWith('cat:')) lista = doMes.filter(l => l.tipo + '|' + l.categoria === S.filtro.slice(4));
  lista.sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)));

  const ent = r2(lista.filter(l => l.tipo === 'Entrada').reduce((s, l) => s + num(l.valor), 0));
  const sai = r2(lista.filter(l => l.tipo !== 'Entrada').reduce((s, l) => s + num(l.valor), 0));

  const chip = (val, rotulo, cor) =>
    `<button class="chip pequeno ${S.filtro === val ? 'on' : ''}" data-acao="filtro" data-f="${esc(val)}">${cor ? `<span class="bolinha" style="background:${cor}"></span>` : ''}${esc(rotulo)}</button>`;

  let html = '', diaAtual = '';
  for (const l of lista) {
    const dia = String(l.dataHora).slice(0, 10);
    if (dia !== diaAtual) { html += `<div class="dia">${esc(rotuloDia(dia))}</div>`; diaAtual = dia; }
    html += itemLanc(l);
  }

  return `
  <h1>Histórico</h1>
  ${mesNav()}
  <div class="filtros">
    ${chip('todos', 'Todos')}${chip('tipo:Saída', 'Saídas')}${chip('tipo:Entrada', 'Entradas')}
    ${catsDoMes.map(k => { const [t, n] = k.split('|'); return chip('cat:' + k, n, corCat(t, n)); }).join('')}
  </div>
  <div class="duplo">
    <div class="card mini"><div class="rotulo">Entradas</div><div class="v num pos">${fmt(ent)}</div></div>
    <div class="card mini"><div class="rotulo">Saídas</div><div class="v num">${fmt(sai)}</div></div>
  </div>
  <div class="lista">${html || '<div class="card vazio" style="margin-top:14px">Nada por aqui neste mês.</div>'}</div>`;
}

/* ---------- LANÇAR ---------- */
function novoForm() {
  return { id: null, tipo: 'Saída', centavos: 0, categoria: null, catManual: false,
    pagamento: lsGet('hrm_ultimo_pag', 'Pix'), descricao: '', dataHora: null };
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
  <h1>${edit ? 'Editar lançamento' : 'Novo lançamento'}</h1>
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

  <label class="rotulo-campo" for="inData">Data e hora</label>
  <input id="inData" type="datetime-local" class="campo" data-campo="dataHora" value="${(f.dataHora || isoLocal()).slice(0, 16)}">

  <button class="btn" data-acao="salvarLanc">${edit ? 'Salvar alterações' : 'Registrar ' + f.tipo.toLowerCase()}</button>
  ${edit ? `
  <button class="btn perigo" data-acao="excluirLanc">Excluir lançamento</button>
  <button class="btn secundario" data-acao="cancelarEdicao">Cancelar</button>` : ''}`;
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
  if (cat && categorias(f.tipo).some(c => c.nome === cat)) { f.categoria = cat; marcarChips(); }
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
  <h1>Economias</h1>
  <div class="resumo-eco">
    <div class="card"><div class="muted pequeno">Guardado</div><div class="v num">${fmt(c.totalCofres)}</div></div>
    <div class="card"><div class="muted pequeno">Rendeu este mês</div><div class="v num ${c.rendMes < 0 ? 'neg' : 'pos'}">${sinal(c.rendMes)}</div></div>
  </div>

  ${bancos.length ? `
  <h2>Por banco</h2>
  <div class="card bancos">
    ${bancos.map(([b, v]) => `<div class="banco"><span><span class="tag">${esc(b.slice(0, 2).toUpperCase())}</span>${esc(b)}</span><b class="num">${fmt(v)}</b></div>`).join('')}
  </div>` : ''}

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
    <div class="cab">
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
        <span class="ico" style="background:rgba(127,184,240,.14);color:var(--azul-claro)">${v >= 0 ? icone.sobe : icone.desce}</span>
        <span class="meio"><div class="t1">${rot[m.tipo] || esc(m.tipo)}</div><div class="t2">${dataCurta(m.dataHora)} · ${hora(m.dataHora)}</div></span>
        <span class="val num ${v >= 0 ? 'pos' : 'neg'}">${sinal(v)}</span></div>`;
    }).join('') : '<div class="vazio">Nenhum movimento ainda.</div>'}
    </div>
    <button class="btn secundario" data-acao="fecharFolha">Fechar</button>`);
}

/* ---------- AJUSTES ---------- */
function ajustes() {
  const d = S.dados;
  const listaCats = tipo => categorias(tipo).map(c => `
    <div class="ajuste-item">
      <span class="chip" style="background:none;border:0;padding:0"><span class="bolinha" style="background:${c.cor}"></span>${esc(c.nome)}</span>
      <button class="x-btn" data-acao="delCat" data-tipo="${esc(tipo)}" data-nome="${esc(c.nome)}" aria-label="Remover ${esc(c.nome)}">${icone.x}</button>
    </div>`).join('') || '<div class="vazio">Nenhuma categoria.</div>';

  return `
  <h1>Ajustes</h1>

  <h2>Carteira</h2>
  <div class="card">
    <div class="ajuste-item">
      <div><b>Saldo inicial</b><div class="muted pequeno">O que você tinha ao começar a usar o app</div></div>
      <button class="chip pequeno" data-acao="editarSaldoInicial">${fmt(num(d.config.saldoInicial))}</button>
    </div>
  </div>

  <h2>Categorias de saída</h2>
  <div class="card">${listaCats('Saída')}
    <button class="btn secundario" data-acao="novaCat" data-tipo="Saída">+ Nova categoria de saída</button>
  </div>

  <h2>Categorias de entrada</h2>
  <div class="card">${listaCats('Entrada')}
    <button class="btn secundario" data-acao="novaCat" data-tipo="Entrada">+ Nova categoria de entrada</button>
  </div>

  <h2>Segurança</h2>
  <div class="card">
    <div class="ajuste-item">
      <div><b>Pedir PIN ao abrir</b><div class="muted pequeno">Se desligado, este aparelho lembra o PIN</div></div>
      <button class="interruptor ${S.pedirPin ? 'on' : ''}" data-acao="pedirPin" aria-label="Pedir PIN ao abrir"></button>
    </div>
    <div class="ajuste-item">
      <div><b>Bloquear agora</b><div class="muted pequeno">Exige o PIN para abrir de novo</div></div>
      <button class="chip pequeno" data-acao="bloquear">Bloquear</button>
    </div>
  </div>

  <h2>Este aparelho</h2>
  <div class="card">
    <div class="ajuste-item">
      <div><b>Link para o celular</b><div class="muted pequeno">Copia um link que já abre o app ligado à planilha (o PIN continua sendo pedido)</div></div>
      <button class="chip pequeno" data-acao="copiarLink">Copiar</button>
    </div>
    <div class="ajuste-item">
      <div><b>Atualizar dados</b><div class="muted pequeno">Busca de novo tudo da planilha</div></div>
      <button class="chip pequeno" data-acao="recarregar">Atualizar</button>
    </div>
    <div class="ajuste-item">
      <div><b>Desconectar</b><div class="muted pequeno">Remove o link e o PIN deste aparelho. Seus dados continuam na planilha.</div></div>
      <button class="chip pequeno" data-acao="trocarPlanilha" style="color:var(--vermelho)">Sair</button>
    </div>
  </div>
  <p class="muted pequeno" style="text-align:center;margin-top:24px">HRM Finance · versão ${VERSAO_APP}</p>`;
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
  filtro(el) { S.filtro = el.dataset.f; render(); },
  fecharFolha() { fecharFolha(); },

  /* lançamentos */
  tipo(el) {
    if (S.form.tipo === el.dataset.tipo) return;
    S.form.tipo = el.dataset.tipo; S.form.categoria = null; S.form.catManual = false;
    render();
    sugerirCategoria(S.form.descricao);
  },
  cat(el) { S.form.categoria = el.dataset.nome; S.form.catManual = true; marcarChips(); },
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

    if (!f.id) {
      enfileirar({ acao: 'addLancamento', dados });
      avisar(f.tipo === 'Saída' ? `Saída de ${fmt(dados.valor)} registrada` : `Entrada de ${fmt(dados.valor)} registrada`);
      S.form = null; S.view = 'painel'; S.mes = dados.dataHora.slice(0, 7);
      render(); window.scrollTo(0, 0);
      processarFila();
      return;
    }
    const pend = S.fila.find(x => x.acao === 'addLancamento' && x.dados.id === f.id);
    if (pend) {
      pend.dados = dados; salvarFila();
      avisar('Lançamento atualizado');
      S.form = null; S.view = 'historico'; render(); processarFila();
      return;
    }
    if (await executar('editLancamento', dados, 'Lançamento atualizado')) { S.form = null; S.view = 'historico'; render(); }
  },
  async excluirLanc() {
    const f = S.form;
    if (!confirm('Excluir este lançamento?')) return;
    const i = S.fila.findIndex(x => x.acao === 'addLancamento' && x.dados.id === f.id);
    if (i >= 0) { S.fila.splice(i, 1); salvarFila(); avisar('Lançamento excluído'); S.form = null; S.view = 'historico'; render(); return; }
    if (await executar('delLancamento', { id: f.id }, 'Lançamento excluído')) { S.form = null; S.view = 'historico'; render(); }
  },
  cancelarEdicao() { S.form = null; S.view = 'historico'; render(); },
  editarLanc(el) {
    const l = S.dados.lancamentos.find(x => String(x.id) === el.dataset.id);
    if (!l) return;
    S.form = { id: l.id, tipo: l.tipo, centavos: Math.round(num(l.valor) * 100), categoria: l.categoria, catManual: true,
      pagamento: l.pagamento || 'Pix', descricao: l.descricao || '', dataHora: l.dataHora };
    S.view = 'lancar';
    render(); window.scrollTo(0, 0);
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
    if (await executar('delCategoria', { tipo, nome }, 'Categoria removida')) render();
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

  /* ajustes */
  editarSaldoInicial() { folhaSaldoInicial(); },
  async salvarSaldoInicial() {
    const v = centavosDe($('#inIniAj')) / 100;
    if (await executar('setConfig', { chave: 'saldoInicial', valor: v }, 'Saldo inicial atualizado')) { fecharFolha(); render(); }
  },
  pedirPin() {
    S.pedirPin = !S.pedirPin;
    lsSet('hrm_pedir_pin', S.pedirPin);
    guardarPin();
    render();
    avisar(S.pedirPin ? 'O PIN será pedido ao abrir o app' : 'Este aparelho vai lembrar o PIN');
  },
  bloquear() { esquecerPin(); S.pinDig = ''; render(); },
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
    if (campo === 'centavos') S.form.centavos = +t.dataset.centavos || 0;
    else if (campo === 'dataHora') S.form.dataHora = t.value ? t.value + ':00' : null;
    else S.form[campo] = t.value;
  }
  if (t.id === 'inDesc') sugerirCategoria(t.value);
  if (t.id === 'inSaldoNovo') atualizarDif();
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
  S.base = normalizarBase(S.base);
  recalcular();
  render();
  if (S.url && S.pin) atualizar();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
})();
