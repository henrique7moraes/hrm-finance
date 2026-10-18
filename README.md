# HRM Finance

App pessoal de controle financeiro do Henrique: registro imediato de entradas e saídas, categorias, forma de pagamento, cofrinhos com metas e rendimento — tudo guardado numa planilha do Google Sheets.

**Link do app:** https://henrique7moraes.github.io/hrm-finance/

---

## Como funciona

```
 Celular / computador          Google                       Sua conta Google
┌──────────────────┐   PIN   ┌──────────────┐   grava/lê   ┌──────────────────┐
│  HRM Finance     │ ──────▶ │ Apps Script  │ ───────────▶ │  Planilha        │
│  (GitHub Pages)  │ ◀────── │ (Codigo.gs)  │ ◀─────────── │  (seus dados)    │
└──────────────────┘         └──────────────┘              └──────────────────┘
```

- **GitHub** guarda só as telas do app (este repositório). Nenhum dado financeiro fica aqui.
- **Planilha** guarda todos os seus dados, na sua conta Google.
- **Apps Script** é a ponte: recebe os lançamentos e só responde a quem envia o PIN certo.

---

## Passo a passo da instalação (uma vez só)

### 1. Criar a planilha
1. Acesse **sheets.google.com** e crie uma planilha em branco.
2. Dê o nome **HRM Finance**.

### 2. Colar o código da ponte (Apps Script)
1. Na planilha, clique em **Extensões → Apps Script**.
2. Apague todo o código que aparece no editor.
3. Abra o arquivo [`apps-script/Codigo.gs`](apps-script/Codigo.gs) aqui no GitHub, clique no ícone **Copiar** (Copy raw file) e cole no editor.
4. Na linha `const PIN = '0000';`, troque `0000` pelo seu PIN (de 4 a 8 números).
5. Clique no ícone de **disquete (Salvar)**.

### 3. Criar as abas da planilha
1. No topo do editor, na lista de funções, escolha **configurar** e clique em **Executar**.
2. O Google vai pedir autorização: **Revisar permissões** → escolha sua conta.
3. Vai aparecer "O Google não verificou este app". É normal, porque o app é seu. Clique em **Avançado** → **Acessar HRM Finance (não seguro)** → **Permitir**.
4. Volte para a planilha: as abas *Lancamentos, Categorias, Cofrinhos, MovCofrinhos e Config* foram criadas.

### 4. Publicar a ponte
1. No editor do Apps Script, clique em **Implantar → Nova implantação**.
2. Na engrenagem ao lado de "Selecionar tipo", escolha **App da Web**.
3. Preencha:
   - **Executar como:** Eu
   - **Quem pode acessar:** Qualquer pessoa
4. Clique em **Implantar** e copie o **URL do app da Web** (termina em `/exec`). Guarde esse link.

> "Qualquer pessoa" é necessário para o app conseguir falar com a planilha. Sem o PIN, ninguém consegue ler nem gravar nada.

### 5. Ligar o site no GitHub Pages
1. Aqui no repositório, clique em **Settings** (Configurações) → **Pages** (menu da esquerda).
2. Em **Source**, escolha **Deploy from a branch**.
3. Em **Branch**, escolha **main** e a pasta **/ (root)** → **Save**.
4. Espere 1 a 2 minutos e abra: **https://henrique7moraes.github.io/hrm-finance/**

### 6. Primeiro acesso
1. Abra o link do app, cole o **URL do app da Web** (passo 4) e digite o **PIN**.
2. Informe quanto você tem disponível hoje (sem contar cofrinhos).
3. Pronto! Crie seus cofrinhos na aba **Economias**.

### 7. Instalar no celular
- Dica: no computador, vá em **Ajustes → Link para o celular → Copiar** e mande o link para você mesmo (WhatsApp, e-mail). Ele já abre o app com a planilha preenchida; só falta o PIN.
- **Android (Chrome):** menu **⋮** → **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari):** botão **Compartilhar** → **Adicionar à Tela de Início**.

---

## Como usar no dia a dia

| Quero… | Onde |
|---|---|
| Registrar um gasto ou entrada | Botão **+** → valor → categoria → **Registrar** |
| Ver quanto tenho para gastar | **Painel → Na carteira** |
| Ver tudo, incluindo cofrinhos | **Painel → Saldo total** |
| Corrigir ou apagar um lançamento | **Histórico** → toque no lançamento |
| Guardar dinheiro | **Economias** → cofrinho → **Guardar** (sai da carteira) |
| Tirar dinheiro do cofrinho | **Economias** → cofrinho → **Resgatar** (volta para a carteira) |
| Registrar rendimento | **Economias** → cofrinho → **Atualizar saldo** (digite o valor que o banco mostra) |
| Criar ou remover categorias | **Ajustes** |
| Separar dízimo e oferta de uma entrada | Ao registrar a entrada, ligue **Dízimo** e/ou **Oferta** |
| Ver o que está reservado para a igreja | **Painel → Reservado para a igreja** (ou **Economias**) |
| Registrar o envio do mês à igreja | **Dízimos e ofertas → Enviei para a igreja** |

**Regras do app**
- Guardar e resgatar **não** contam como saída nem entrada: só mudam o dinheiro de lugar.
- O rendimento dos cofrinhos fica no cofrinho e só aumenta o **Saldo total**. Quando um rendimento cair direto na conta, registre como entrada na categoria **Rendimento**.
- Sem internet? Registre normalmente: o lançamento fica marcado como "enviando" e sobe sozinho quando a conexão voltar. A bolinha no topo mostra o estado: verde (em dia), amarela (enviando), vermelha (sem conexão).
- Dízimo é 10% da entrada, arredondado para cima no centavo, e a oferta (opcional) vem sugerida igual ao dízimo, mas você pode mudar. O valor sai da carteira na hora (conta como gasto em **Dízimos e ofertas**) e fica reservado, fora do saldo total, até você marcar o envio à igreja. Para mudar a oferta, edite a entrada. O dízimo e a oferta usam o mesmo número de registro (Nº) da entrada de onde vieram.
- Ao descrever um gasto ("mercado", "uber"…), o app sugere a categoria e aprende com o que você já registrou.

---

## Manutenção

**Trocar o PIN:** edite a linha `const PIN` no Apps Script, salve e faça **Implantar → Gerenciar implantações → ✏️ (editar) → Versão: Nova versão → Implantar**. O link continua o mesmo. Depois, no app, entre com o novo PIN.

**Atualizar o código da planilha:** mesmo caminho acima (colar o novo código, salvar, nova versão da implantação).

**Atualizar as telas do app:** basta atualizar os arquivos neste repositório; o GitHub Pages publica sozinho e o app se atualiza ao abrir.

---

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Estrutura da página |
| `style.css` | Visual (cores, botões, telas) |
| `app.js` | Lógica: telas, cálculos, comunicação com a planilha |
| `sw.js` | Permite instalar e abrir rápido, mesmo com internet fraca |
| `manifest.webmanifest` | Nome, cores e ícone do app instalado |
| `icon*.png`, `icon.svg` | Ícone do HRM Finance |
| `apps-script/Codigo.gs` | Código da ponte com a planilha (vai no Apps Script, não roda no GitHub) |
