# GEMBA FTA — revisão da cópia do GitHub

Data: 27/08/2026. Base: GEMBRA-FTA-2.0-main.zip enviado pelo usuário.
SHA-256 do ZIP original: 7918e68ead96a532d840882d45d6c9a7409a6ac3056b8e9ab67ae49e87300cbd.

## Resultado e limites

Código revisado em uma cópia isolada; o arquivo original foi preservado. TypeScript e build aprovados; 22 testes locais aprovados. O banco de produção não foi modificado. Nenhum push, deploy, publicação de regras ou alteração de Authentication foi executado.

Isto não confirma os números reais do Dashboard/Farol, nem o salvamento em produção. Não houve sessão autenticada de teste. A prévia local de navegador foi bloqueada pelo ambiente. A página pública de login do Netlify carregou na verificação anterior; isso não valida as telas internas.

## Problemas encontrados no código e correções

1. **Histórico e responsáveis:** a unificação descartava IDs antigos, enquanto Farol e filtros comparavam apenas o ID atual. Agora o diretório conserva aliases confirmados por UID/e-mail normalizado; um nome histórico completo só é usado se houver correspondência exata e única. Homônimos não são fundidos. Inspeções sem vínculo confirmado geram aviso no Farol. Nenhum ID ou documento histórico foi regravado. Esta é uma causa possível da diferença entre Dashboard e Farol; sem ler os dados reais, não é possível atribuir cada registro da captura a essa causa.
2. **Mês:** Dashboard, Farol e Ranking recalculam o mês automático pela data operacional em America/Sao_Paulo, inclusive ao retornar à página. O filtro explícito de mês passado continua fixo. Setembro sem registros mostra zero; selecionar agosto recupera a visão de agosto. Não existe rotina de apagar ou zerar o banco na virada do mês. Histórico aplica filtros antes da paginação. Exportações deixam de iniciar fixas em julho/2026.
3. **Farol e metas:** o Farol recebe a base autorizada completa e calcula seu próprio mês/contrato, sem herdar uma lista já reduzida por filtros semanais do Dashboard. Numerador e denominador de metas usam o mesmo conjunto elegível; Vale/VLI permanecem separados. Líder mantém 4/semana e 16/mês, e supervisor conserva metas configuradas. Removido ajuste de meta por nome. Percentuais de progresso limitados a 100%, sem ocultar o total realizado. A regra operacional de semanas e a pontuação não foram alteradas.
4. **Sincronização:** listeners não são encerrados ao minimizar/trocar de aba. Estado inicial distingue cache vazio de resposta vazia confirmada. Erros preservam o último estado recebido e aparecem com opção de tentar novamente. O rodapé só informa sincronizado quando os snapshots obrigatórios vieram do servidor sem gravações pendentes. Removidos limites arbitrários do listener de inspeções. Admin/Gestor mantêm leitura do histórico completo; os demais continuam usando consulta de grupos permitidos na origem.
5. **Histórico/Relatórios:** removidas consultas paralelas com limite de 25/100 e fallback de 300 registros. Agora usam a mesma base autorizada em tempo real do App. A paginação do Histórico ocorre após os filtros; datas legadas e IDs antigos são reconhecidos. A correção também evita que uma cópia antiga de relatório tenha prioridade sobre um snapshot novo.
6. **Salvar/editar:** arrays de fotos/rotações definidos e sanitização recursiva de undefined mantida. O ID da nova inspeção fica estável no rascunho; envio duplo é bloqueado. Edição conserva ID, autoria, data original e grupo quando localidade/contrato não mudam. Após confirmar a gravação principal, falha de auditoria/notificação vira aviso, não falsa falha de gravação. O fluxo não apaga a inspeção para editá-la.
7. **Rascunhos:** separados por UID e por criação/edição; inicialização não depende de cada snapshot de supervisores/configuração. Cópia síncrona local e fila IndexedDB; leitura escolhe a versão mais recente. Campos, referências de fotos e rolagem são conservados; eventos de saída/troca de aba fazem flush. Limpeza só após salvar ou descartar explicitamente. Falta de espaço/permissão de armazenamento não pode garantir persistência: o erro é apresentado.
8. **Rodapé:** removida sobreposição fixa; ele ocupa espaço no layout. Área principal rolável e ações do formulário posicionadas dentro dela, com safe area. Verificação visual em desktop/celular ainda pendente.
9. **Dependências:** package-lock sincronizado com as dependências declaradas, sem alterar package.json. Simulação offline de npm ci aprovada. Instalação limpa real em outra máquina/Netlify permanece pendente.

## Segurança e integridade: atenção antes de publicar

- Banco preservado: ai-studio-gembafta-570b0537-aea6-4a55-ac2a-d81d9f8cc2d0. Configuração Firebase, firestore.rules, storage.rules e firebase.json são idênticos aos do ZIP recebido.
- **Não publique firestore.rules automaticamente.** O arquivo original contém fallback de inspeção sem grupo para Vale; esta revisão não atesta sua segurança. Exige auditoria de regras e validação no emulador.
- Usuários restritos continuam sem receber inspeções legadas sem grupoContrato pelas consultas por contrato. Isso não apaga o histórico. A regularização desses registros exige pré-visualização e reconciliação administrativa confirmada; não foi executada.
- A consulta de supervisors ainda segue o fluxo original de diretório e filtragem local. Isolamento de leitura de todos os metadados operacionais pelas regras não está validado. Não declarar separação de segurança completa a partir destes testes.
- Nenhuma migração, exclusão ou gravação de inspeções/usuários de produção foi feita neste trabalho. Rotinas administrativas preexistentes não foram executadas.
- Diretório sem evidência suficiente pode deixar vínculos pendentes. Não inventar associações para fazer os totais coincidirem.
- Login, primeiro acesso, recuperação de senha, perfis e regras efetivamente publicados precisam de teste autenticado; não foram testados manualmente nesta execução.

## Testes locais executados — 22/22 aprovados

São testes com dados fictícios e Firestore simulado; Farol e Histórico também são renderizados como HTML em memória. Não são testes de navegador nem do Firebase real.

| Nº | Comportamento validado |
| --- | --- |
| 1 | Trocar agosto → setembro → agosto preserva registros e contagem anterior. |
| 2 | Virada de mês em São Paulo e filtro histórico fixo. |
| 3 | Deduplicação mensal por ID, não por descrição. |
| 4 | E-mail confirmado conserva aliases de IDs históricos. |
| 5 | Homônimos não são unidos nem atribuídos por adivinhação. |
| 6 | Nome histórico exato e único permite resolver vínculo. |
| 7 | Farol contabiliza 30 registros históricos com alias, sem Vale/julho no mês VLI; progresso limitado a 100%. |
| 8 | Farol informa registros sem vínculo confirmado. |
| 9 | Classificação Vale/VLI em leitura sem mutar registros. |
| 10 | Líder 4/16; supervisor com meta personalizada 7/28 preservada. |
| 11 | DIAL e Desvio Comportamental exclusivos, dois pontos cada. |
| 12 | Permissões legadas normalizadas para arrays; admin com dois grupos. |
| 13 | Listener restrito filtra na origem; admin sem limite; início idempotente. |
| 14 | Cache inicial vazio permanece carregando. |
| 15 | Erro de listener preserva dados e não informa sincronizado. |
| 16 | Salvamento remove undefined aninhado, mantém sentinelas e arrays. |
| 17 | Falha complementar de notificação não invalida gravação principal confirmada. |
| 18 | Falha da gravação principal não informa sucesso. |
| 19 | Edição conserva ID, autoria, data e contrato histórico. |
| 20 | Rascunhos separam criação/edição e UID; fallback local e limpeza seletiva. |
| 21 | Histórico aplica mês antes de paginar e apresenta responsável histórico. |
| 22 | Snapshot emite evento esperado pelas telas em tempo real. |

Comandos executados:

```
node tests/run.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
npm ci --offline --ignore-scripts --dry-run --audit=false --fund=false
```

TypeScript 5.8.3: saída 0, nenhum diagnóstico. O compilador local foi usado sem download por npx.
Build Vite 6.4.3: saída 0. Avisos de importação dinâmica/estática e chunk grande permanecem (JS principal cerca de 3,71 MB, 975 kB gzip). Não impedem o build, mas podem afetar carregamento em rede lenta.
`npm ci --dry-run`: apenas simulação; não equivale a instalação limpa real.
Logs finais anexados em validacao/.

## Conferência manual antes de atualizar o GitHub

1. Abra este projeto em ambiente de teste e confirme login. Não configure outro banco nem execute migração/publicação de regras.
2. Registre os totais reais de agosto por contrato e responsável. Compare Dashboard/Farol com as inspeções do mesmo mês e elegibilidade; verifique avisos de vínculo pendente.
3. Selecione setembro e volte a agosto. Setembro só será zero se não houver registros de setembro. Totais históricos não devem ser regravados.
4. Com autorização para criar registros de teste, salve uma inspeção sem foto e outra com foto. Aguarde confirmação, abra Histórico e edite o mesmo registro. Confirme ID e ausência de duplicidade. Não apagar registros reais para testar.
5. Preencha um rascunho, mude de aba e volte; repita em edição. Confira fotos e campos. Teste desconexão/reconexão.
6. Verifique botão Salvar no fim do formulário, desktop e celular. Teste Admin/Gestor e um usuário de cada contrato.
7. Só depois das conferências e do build limpo atualize a branch correta do GitHub. Se ligada ao Netlify, essa atualização pode disparar deploy automático. Não foi feito aqui.

## Arquivos

Alterados: package-lock.json; src/App.tsx; src/components/DashboardView.tsx; src/components/ExportacoesView.tsx; src/components/FarolGembaView.tsx; src/components/HistoricoView.tsx; src/components/LancarInspecaoView.tsx; src/components/RankingView.tsx; src/components/RelatoriosView.tsx; src/index.css; src/services/db.ts; src/types.ts; src/utils/draftStorage.ts; src/utils/inspectionUtils.ts; src/utils/operational.ts; src/utils/supervisors.ts.

Adicionados: src/utils/useOperationalDate.ts e testes em tests/. Testes/preview são somente adaptadores locais; não são usados pelo build normal. Não incluem credenciais de produção.

O ZIP contém fontes, testes, relatório e logs. Não inclui node_modules nem dist; executar instalação/build no ambiente de destino. Nenhum arquivo de origem foi removido.
