# Como contribuir com o registro

Aqui só entram **metadados públicos**: endereço de relay, endereço de servidor e onde baixar um mod
aprovado (com o hash dos bytes). Código do jogo, segredo, chave, senha, token, endereço interno e
dado de jogador **não entram** — o validador recusa, e um PR com isso é fechado.

Antes de qualquer coisa, leia a seção "Até onde vai a confiança" do [`README.md`](README.md).

## O caminho

1. Fork, e um branch com um nome que diga o que é (`mod-meu-mod`, `servidor-xyz`).
2. Edite **um** arquivo. Entrada nova vai **no fim da lista** (a ordem é a que o jogo mostra).
3. Atualize o `updated` do arquivo para a data de hoje (`AAAA-MM-DD`).
4. `npm install && npm run validate`.
5. Abra o PR. Diga o que é a entrada, quem cuida dela e como você conferiu.

Formatação: JSON com **2 espaços** de indentação, fim de linha LF e **uma** quebra de linha no fim do
arquivo, sem tabulação e sem espaço sobrando no fim das linhas. Um array curto de textos (como
`tags`) pode ficar numa linha só — é a forma legível. O validador confere isso antes de olhar o
conteúdo.

## `mods.json` — uma entrada campo por campo

```json
{
  "id": "meu_mod",
  "name": "Meu mod",
  "repo": "meu-usuario/mod-meu-mod",
  "version": "0.1.0",
  "side": "both",
  "description": "O que o mod faz, em uma ou duas frases, em português.",
  "tags": ["blocos", "utilidade"],
  "download": "https://github.com/meu-usuario/mod-meu-mod/releases/download/v0.1.0/meu_mod-0.1.0.mcmod",
  "sha256": "<64 caracteres hexadecimais>",
  "size": 1234
}
```

| campo | obrigatório | regra |
| --- | --- | --- |
| `id` | sim | o `name` do `package.json` dentro do `.mcmod`. Minúsculas, `_` permitido. **Nunca muda.** |
| `name` | sim | o nome que aparece na tela, até 48 caracteres |
| `repo` | sim | `usuario/repositorio` onde está a Release |
| `version` | sim | igual à do `.mcmod` (`X.Y.Z`) |
| `side` | sim | `client`, `server` ou `both` |
| `description` | sim | em português, até 400 caracteres, sem propaganda |
| `tags` | não | até 8, minúsculas (`visual`, `mob`, `hud`, `clima`, `itens`, `blocos`, `utilidade`...) |
| `download` | sim | o anexo `.mcmod` da Release **desse** `repo`, em `https` |
| `sha256` | sim | o hash dos bytes daquele anexo |
| `size` | não | o tamanho em bytes do anexo (o validador confere) |
| `requires` | não | ids de outros mods **deste** arquivo que precisam carregar junto |
| `authors` | não | até 8 nomes |
| `homepage` | não | uma página `https` |

### Tirando o `sha256`

```
curl -sL -o meu_mod.mcmod "<a URL do download>"
sha256sum meu_mod.mcmod       # no Windows: certutil -hashfile meu_mod.mcmod SHA256
```

Pegue o hash do **anexo publicado**, não do arquivo que você montou localmente: o jogo baixa o anexo.

### Versão nova de um mod que já está na lista

**Edite a entrada que existe** — não acrescente outra com o mesmo `id`. Mudam `version`, `download`,
`sha256` e `size`. O `id` fica.

## `servers.json` — uma entrada campo por campo

```json
{
  "id": "meu-servidor",
  "name": "Meu servidor",
  "address": "https://play.exemplo.com",
  "description": "O que o servidor é, em uma ou duas frases.",
  "region": "sa-east",
  "tags": ["anarquico", "pvp"]
}
```

- `address` é **só a origem** (`https://host[:porta]`), sem caminho e sem query. `https` obrigatório.
- `ws` é opcional: o jogo usa `<address>/ws` quando o campo não está lá. Se estiver, tem de ser `wss`
  e do mesmo host.
- `official` **não é para você**: só vale para um endereço do dono, e o validador recusa de outro.
- `site` é opcional, e `https`.
- `region` segue o estilo `sa-east`, `eu-west`, `us-east`.

Antes de abrir o PR confira que `https://seu-endereco/healthz` responde — é o que a tela Multiplayer
chama para mostrar "Online · N jogadores".

## `relays.json` — fechado por enquanto

O relay **oficial** é decisão do dono e ainda não saiu. O que está na lista é um relay **de teste**.
Um PR de relay de terceiro pode ser aberto, mas fica esperando essa decisão. A forma da entrada:

```json
{
  "id": "meu-relay",
  "name": "Meu relay",
  "url": "wss://relay.exemplo.com",
  "health": "https://relay.exemplo.com/healthz",
  "stats": "https://relay.exemplo.com/stats",
  "region": "br",
  "status": "teste",
  "maxPlayersPerRoom": 8,
  "operator": "quem cuida"
}
```

- `url` é `wss` obrigatoriamente; `health` é `https` e é o que o jogo chama para medir a latência.
- Sem `health`, o jogo tenta `https://<host do url>/healthz`.
- `status` é `teste` (o padrão, e o jogo avisa na tela) ou `producao`.
- `maxPlayersPerRoom` é o limite do próprio relay por mundo hospedado.
- `region` aceita `br` ou o estilo de nuvem (`sa-east`, `eu-west-1`).

A imagem do relay é pública no Docker Hub (`azx0025/mineclaude-relay`): dá para subir o seu, com as
origens permitidas apontando para o seu servidor.

## O que faz um PR ser recusado

- O validador falhou (e ficou falhando).
- `sha256` que não bate com o anexo, ou anexo que não existe.
- Host local ou interno, IP no lugar de nome, `http`/`ws` sem TLS.
- Arte copiada do Minecraft/Mojang ou de outro jogo, no mod.
- Mexer na entrada de outra pessoa sem pedido dela.
- `"official": true` em endereço que não é do dono.
- Propaganda, link de pagamento, promessa de vantagem por dinheiro, conteúdo que não serve para a
  idade do jogo.

## Dúvida?

Abra uma **Issue** antes de montar o PR. É mais rápido que descobrir na revisão.
