# Registro do MineClaude

Este repositório é a **lista pública** que o [MineClaude](https://mineclaude.com) lê para sugerir
**relays**, **servidores** e **mods aprovados** dentro do jogo. São três arquivos JSON e os esquemas
que os validam — **nada aqui é código do jogo**.

O jogo lê os arquivos crus, direto do GitHub:

```
https://raw.githubusercontent.com/mine-claude/registry/main/relays.json
https://raw.githubusercontent.com/mine-claude/registry/main/servers.json
https://raw.githubusercontent.com/mine-claude/registry/main/mods.json
```

Quem hospeda o próprio MineClaude pode apontar o jogo para outra lista (variável de ambiente
`REGISTRY_URL`, ou o campo na tela de Opções). Sem acesso à internet o jogo **continua funcionando**
com o que já vem embutido e com a última cópia boa que tiver guardado; só aparece um aviso na tela.

## O que é cada arquivo

| arquivo | o que guarda | o jogo usa onde |
| --- | --- | --- |
| `relays.json` | relays de WebSocket que repassam as conexões de um mundo hospedado no navegador | ao **abrir um mundo para amigos**: o jogo mede a latência de cada um (`/healthz`) e escolhe o mais rápido |
| `servers.json` | servidores do jogo que valem ser mostrados a quem está começando | na tela **Multiplayer**, abaixo do servidor desta página, com o ping de cada um |
| `mods.json` | mods `.mcmod` aprovados: onde baixar, a versão e o **sha256** dos bytes | na tela **Mods**, aba **Aprovados** |

Cada arquivo tem a mesma casca: `version` (hoje `1`), `updated` (a data da última mudança) e a lista.
A forma exata de cada entrada está em `schema/*.schema.json`, e o formato está explicado com mais
detalhe em [`docs/registry.md`](https://github.com/mine-claude/registry) do repositório do
jogo.

### `relays.json` — um relay, e ele está **em teste**

**Qual será o relay oficial é decisão do dono**, e ela ainda não saiu. O que está na lista hoje é um
relay **de teste** (`"status": "teste"`), e o jogo mostra isso na tela. A imagem do relay é pública no
Docker Hub (`azx0025/mineclaude-relay`), então quem quiser subir o seu próprio relay pode.

Com a lista vazia — ou sem acesso a ela — um mundo hospedado usa o relay embutido no jogo (o do
próprio servidor que serviu a página): nada deixa de funcionar.

### Até onde vai a confiança

- **Mod: o sha256 manda.** O que garante um mod é o `sha256` fixado aqui. O jogo baixa o `.mcmod`,
  calcula o hash e **recusa a instalação** se não bater, byte por byte. Trocar o anexo de uma Release
  depois de aprovada não passa: o hash muda e o jogo recusa.
- **Relay e servidor são só sugestões.** Eles não são verificados nem auditados: aparecem na tela com
  essa etiqueta ("sugerido pelo registro"). Entrar num servidor de outra pessoa é sempre escolha do
  jogador, como já era ao digitar um endereço à mão.
- **Só metadado público.** Nunca entra aqui código do jogo, segredo, chave, token, senha, endereço
  interno (`localhost`, IP de rede local, `.local`) nem dado de jogador. O validador recusa.
- **`"official": true`** só vale para um endereço do próprio dono (`mineclaude.com`); o validador
  recusa de qualquer outro.

## Propor uma entrada (por Pull Request)

1. Dê um **fork** deste repositório.
2. Edite **só** o arquivo que te interessa (`relays.json`, `servers.json` ou `mods.json`) — uma
   entrada nova vai **no fim da lista**, e `updated` passa a ser a data de hoje.
3. Rode o validador antes de abrir o PR:
   ```
   npm install
   npm run validate
   ```
4. Abra o PR explicando **o que é** a entrada e **quem cuida dela**. O Actions roda o mesmo validador
   no seu PR; se ele apontar algo, o PR não é olhado até passar.

Os passos com os detalhes de cada campo estão no [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Como um PR é revisado

Vale para os três arquivos:

- **O validador tem de passar.** Esquema, ids únicos, só `https`/`wss`, host público, e — para mod —
  o anexo da Release existe mesmo e o `sha256` bate com os bytes.
- **Uma entrada por PR**, salvo se houver um motivo claro para juntar.
- **Nada de mexer na entrada de outra pessoa.** Editar ou remover o que não é seu só por pedido de
  quem cuida dela (ou do dono).

Para **servidor**:
- Endereço estável e alcançável, com `https` de verdade (certificado válido) e `/healthz` respondendo.
- Nome e descrição honestos, sem propaganda, sem link de pagamento e sem promessa de vantagem por
  dinheiro.
- Nada de conteúdo que não serve para a idade do jogo (o MineClaude é para todo mundo).

Para **mod**:
- O `.mcmod` tem de estar numa **Release** do repositório que a entrada nomeia, e o `sha256` tem de
  ser dos bytes **daquele** anexo.
- O mod é lido antes de entrar: ele usa a API pública do SDK, **arte 100% original** (nada de
  Minecraft/Mojang nem de outros jogos) e não tenta sair da caixa (rede para fora, código remoto,
  dado do jogador).
- O `id` é o nome dentro do `.mcmod` e **nunca muda**. Versão nova é um PR que troca `version`,
  `download`, `sha256` e `size` da entrada que já existe — nunca uma entrada nova.
- `side` diz onde o mod roda: `client` (só navegador), `server` (só servidor) ou `both`.
- `icon` e `screenshots` são opcionais e, se vierem, moram em `raw.githubusercontent.com` (o único
  host de imagem que a página do jogo consegue ler). O validador baixa cada uma e confere formato,
  tamanho e, no ícone, que é quadrado. Arte original, como o resto do mod.

Para **relay**:
- A lista é fechada por enquanto: **o relay oficial é decisão do dono**. PR de relay de terceiro fica
  aberto até essa decisão sair.

## Rodando o validador

Precisa de Node 20 ou mais novo.

```
npm install
npm run validate           # esquema + regras + confere o anexo e o sha256 de cada mod (usa a rede)
npm run validate:offline   # só esquema + regras, sem rede
```

## Licença

Ainda não definida — é decisão do dono (REIDOSCOINS). Até ela sair, o conteúdo deste repositório é
público para o jogo ler, sem outra permissão concedida.
