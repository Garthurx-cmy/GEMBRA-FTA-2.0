# GEMBA FTA — correção da leitura do histórico

Data da conferência: 27/08/2026.

## O que este pacote faz

Este é um pacote de alterações para o projeto existente, baseado exatamente no arquivo `gembra-fta-2.0 (3)(1).zip` enviado como versão atual do Studio. **Não é um projeto completo e não contém backup das inspeções.**

Corrige a consulta de Admin/Gestor para receber também inspeções antigas sem `grupoContrato`. Impede que a sincronização execute automaticamente a reconciliação de supervisores. Acrescenta uma contagem visível do histórico recebido, por mês, antes dos filtros do Dashboard e do Farol.

**Não publique no GitHub/Netlify antes de confirmar essa contagem na prévia.** Este pacote não certifica todos os demais fluxos do aplicativo.

## Evidências da causa

Na versão anterior `(2)`, a consulta de `inspections` não exigia `grupoContrato`. Na versão atual `(3)(1)`, passou a existir esta condição também para Admin/Gestor:

```ts
where("grupoContrato", "in", ["vale", "vli"])
```

Inspeções antigas sem esse campo ficam fora do resultado. Isso reduz o histórico recebido sem precisar apagar documentos.

O vídeo enviado mostra a coleção `inspections` no banco nomeado correto, inclusive documentos com datas **06/08/2026 e 11/08/2026**. Confirma a existência desses registros históricos, mas não confirma a quantidade total de 400.

Também foi encontrada na versão atual uma reconciliação automática que criava `supervisors/{UID}` e podia excluir um cadastro anterior `supervisors/sup_*` de mesmo e-mail. Isso pode deixar referências antigas do Farol sem correspondência. A existência desse código foi confirmada; **não foi verificado se ele foi executado no banco real**.

Não foi identificada exclusão automática de inspeções no fluxo de leitura/sincronização examinado. Isso não substitui uma auditoria do banco nem prova que todos os documentos reais estão presentes.

### Reprodução com dados fictícios, sem conexão ao Firebase

Os três serviços foram executados com a mesma base simulada: 400 inspeções, sendo 385 sem `grupoContrato` e 15 classificadas. Destas, 397 tinham data de agosto e 3 de julho.

| Código executado | Recebidas | Agosto recebido |
| --- | ---: | ---: |
| Anterior `(2)` | 400 | 397 |
| Studio atual `(3)(1)` | 15 | 12 |
| Atual com esta correção | 400 | 397 |

Esses números são resultados de teste, **não contagens da produção**. A simulação da reconciliação original também reproduziu a exclusão de um supervisor antigo; nenhuma dessas operações de teste alcançou o Firebase.

## Arquivos substituídos

| Arquivo | Alteração |
| --- | --- |
| `src/services/db.ts` | Leitura completa autorizada para Admin/Gestor; filtros de origem preservados para outros perfis; estados de cache, erro e confirmação do servidor; contagem por mês; remoção da reconciliação automática e da exclusão de supervisores antigos nessa rotina. |
| `src/App.tsx` | Diagnóstico do histórico; aviso de erro e nova tentativa; listeners mantidos durante troca de visibilidade; retirada da limpeza automática de chaves legadas `gemba_fta_` do navegador; estado de sincronização informado a partir da resposta da consulta. |
| `package-lock.json` | Sincronização do lockfile com o `package.json` existente, sem alterar as dependências declaradas nele. |

Os seis arquivos em `tests/` são novos e servem somente à validação isolada. Os demais arquivos deste pacote são instruções, manifesto e registros das verificações.

Não foram alterados `src/services/firebase.ts`, `firebase-applet-config.json`, `firebase-blueprint.json`, `firebase.json`, `firestore.rules`, `storage.rules`, `netlify.toml`, `package.json`, nem os componentes Dashboard/Farol/formulário ou suas regras de pontuação.

O banco permanece:

```text
ai-studio-gembafta-570b0537-aea6-4a55-ac2a-d81d9f8cc2d0
```

## Como aplicar no projeto atual

1. Preserve o ZIP atual do Studio antes de substituir qualquer arquivo. Não use Restore, não force sincronização e não envie a versão antiga ao GitHub.
2. Extraia este pacote. Compare os arquivos atuais com as hashes `base_sha256` do `MANIFESTO-HISTORICO.json`. Se o Studio já tiver recebido outras alterações depois do ZIP `(3)(1)`, compare as diferenças antes de substituir: não sobrescreva mudanças novas às cegas.
3. No projeto existente, aplique os três arquivos acima, mantendo exatamente seus caminhos. Adicione a pasta `tests/`. Não troque a configuração Firebase, as regras, o banco ou a autenticação. Este ZIP não deve substituir a pasta inteira do projeto.
4. Na raiz do projeto, execute os comandos abaixo. Se faltarem dependências, instale com `npm ci` usando o lockfile do pacote.

```sh
node tests/run.mjs
npx tsc --noEmit
npm run build
```

5. Abra a prévia como Admin/Gestor e aguarde o aviso **“servidor confirmado”**. Confira a faixa **“Histórico recebido”**, o número de registros sem `grupoContrato` e o total de `2026-08`.
6. Confira no Histórico/Relatórios os documentos de agosto vistos no vídeo. Compare a quantidade total recebida com a coleção do banco, sem filtros de mês/contrato. A contagem recebida é diferente do total de uma meta ou de um Farol filtrado.
7. Se aparecer `permission-denied`, registre o erro. Não publique regras permissivas, não troque de banco e não execute migração como tentativa automática de correção.
8. Se a contagem total estiver correta, mas o Farol continuar baixo, confira o aviso de IDs de supervisores não encontrados. **Não recrie nem apague pessoas ou inspeções para forçar o total.** Os vínculos exigem análise separada.
9. Antes de publicar, confirme também lançamento, edição e rascunho. Esses fluxos não foram homologados por este pacote.

### Texto para colar no chat do Studio junto com os arquivos do pacote

```text
Aplique somente o pacote GEMBA-CORRECAO-LEITURA-HISTORICO no projeto existente. Não crie outro aplicativo.

Antes de alterar, preserve a versão atual e compare as hashes do MANIFESTO-HISTORICO.json. A base é o ZIP gembra-fta-2.0 (3)(1).zip. Se houver diferenças novas, apresente-as antes de sobrescrever.

Use os arquivos fornecidos: src/App.tsx, src/services/db.ts e package-lock.json; acrescente tests/. Não reimplemente a aplicação com base nesta descrição. Se não conseguir acessar o conteúdo dos arquivos anexados, informe a limitação e não declare a importação concluída.

Não altere Firebase Authentication, configurações Firebase, regras ou banco. Não execute reconciliação, migração, exclusão de supervisores/inspeções, push ou deploy. Não sincronize automaticamente com GitHub. Preserve todo o histórico e IDs.

Execute node tests/run.mjs, npx tsc --noEmit e npm run build. Mostre os resultados reais. Na prévia autenticada como Admin/Gestor, confira a faixa Histórico recebido e os totais por mês somente depois de servidor confirmado. Se não puder autenticar, marque essa conferência como pendente. Não afirme que as 400 inspeções foram recuperadas sem conferir a quantidade real.
```

## Validação executada

Os testes usam o código real de `db.ts` com um adaptador de Firestore em memória. Não são testes das regras do Firebase nem sessões autenticadas de usuários reais.

| # | Verificação automatizada | Resultado |
| --- | --- | --- |
| 1 | Admin recebe 400 registros simulados, incluindo 385 sem grupo, sem mudar IDs | Passou |
| 2 | Gestor e perfis de administrador normalizados recebem registros legados | Passou |
| 3 | Usuário de um contrato mantém filtro na origem e não lista `users` | Passou |
| 4 | Usuário comum de dois contratos continua limitado a documentos classificados | Passou |
| 5 | Perfil ausente/inativo não inicia leitura; permissões vazias não liberam toda a coleção | Passou |
| 6 | Início da sincronização e snapshots não reconciliam, gravam ou excluem documentos | Passou |
| 7 | Reconciliação explicitamente chamada no teste preserva supervisores antigos e IDs das inspeções | Passou |
| 8 | Erro de leitura preserva o último resultado e não é informado como sucesso | Passou |
| 9 | Cache inicial vazio não é tratado como prova de histórico vazio | Passou |
| 10 | Cache/gravações pendentes não recebem confirmação de servidor; cache vazio não remove o último resultado | Passou |
| 11 | Resposta realmente vazia do servidor fica distinguível de carregamento | Passou |
| 12 | Filtro mensal: agosto 397 → setembro 0 → agosto 397, sem modificar a base fictícia | Passou |
| 13 | Consulta autorizada recebe 1.205 registros, sem corte arbitrário em 1.000 e sem duplicar listeners no início | Passou |
| 14 | Referências de supervisores ausentes são informadas, sem regravar IDs | Passou |

- **14 testes passaram; 0 falharam.**
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit`, saída 0, sem erros. Foi usado o compilador já instalado, equivalente ao comando `npx tsc --noEmit` deste projeto.
- Build: `npm run build`, saída 0. Permanecem avisos de arquivo JavaScript grande (aproximadamente 4,15 MB antes de gzip) e imports estáticos/dinâmicos; não foram tratados como falha de compilação.
- Lockfile: `npm ci --offline --ignore-scripts --dry-run --audit=false --fund=false`, saída 0. **Foi uma simulação, não uma instalação limpa completa**. Compilação e testes utilizaram dependências já disponíveis no ambiente.
- Ambiente de verificação: Node v24.19.0, npm 11.9.0.
- Verificação visual: inspecionados os quadros do vídeo fornecido pelo usuário. **A versão corrigida não foi validada em uma prévia autenticada.**

## Limites e pendências antes de publicar

- Falta confirmar a contagem real das inspeções no servidor após aplicar a alteração. Não houve acesso autenticado ao banco pela execução desta correção.
- Usuários comuns continuam consultando somente grupos permitidos. Para eles, registros antigos sem `grupoContrato` continuam fora da consulta. Resolver isso exige planejamento e autorização específica; este pacote não faz migração nem afrouxa regras.
- A classificação por localidade da versão atual ainda contém fallbacks para Vale que precisam de revisão. **A separação e os totais Vale/VLI não estão homologados por este pacote.**
- IDs de supervisores antigos podem não corresponder ao diretório atual. O diagnóstico avisa, mas não altera vínculos, não recria pessoas e não restaura documentos apagados.
- O teste mensal verifica a função de filtro existente com dados fictícios; não valida todos os cálculos de metas, a virada automática de mês em uma sessão aberta ou os componentes Dashboard/Farol na prévia.
- Lançamento/edição com fotos, rascunho, botão de salvar coberto pelo rodapé e demais ajustes visuais permanecem pendentes de validação/correção na versão do Studio. Não foram refeitos neste pacote de incidente.
- A leitura completa de Admin/Gestor pode aumentar o volume de documentos baixados em relação à consulta incorretamente restrita. Foi removido o limite arbitrário de 1.000; paginação futura deve preservar a contagem completa.

## Integridade e segurança

Nenhum push, deploy ou publicação foi realizado. Nenhuma regra, configuração de Authentication ou documento real do Firestore foi alterado por esta execução. Os ZIPs originais foram preservados.

A correção não adiciona gravações de inspeções no carregamento. O fluxo preexistente de autenticação e atualização de `ultimoLogin` permanece; o aplicativo continua tendo ações manuais de edição/exclusão que não foram acionadas por estes testes.

Não execute migrações para testar o histórico. Não apague dados do navegador antes de verificar rascunhos. O pacote não contém os dados do banco e não pode restaurar um documento que tenha sido realmente excluído.
