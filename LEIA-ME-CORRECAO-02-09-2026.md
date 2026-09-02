# GEMBA FTA — correção final de lançamento, julho e Vale/VLI

Data da validação: 02/09/2026

## Resultado

Esta versão corrige o bloqueio de colaboradores na tela **Salvando**, recupera a competência de julho a partir da data operacional da inspeção e separa os cálculos Vale/VLI sem alterar documentos históricos.

O banco configurado permanece exclusivamente:

`ai-studio-gembafta-570b0537-aea6-4a55-ac2a-d81d9f8cc2d0`

## Causas corrigidas

1. O formulário aguardava também as gravações auxiliares de auditoria e notificação. Uma falta de permissão nessas coleções podia manter o colaborador em **Salvando**, mesmo depois da tentativa de gravar a inspeção.
2. O mês era obtido primeiro de campos legados como `mesReferencia`. Uma inspeção com `data` em julho e referência antiga em agosto desaparecia do calendário de julho.
3. O contrato da inspeção podia ser inferido pelo grupo do supervisor. Isso misturava Vale e VLI quando a pessoa tinha vínculo diferente ou acesso aos dois contratos.
4. Campos `undefined`, principalmente rotações de fotos herdadas de registros antigos, podiam ser rejeitados pelo Firestore.
5. Existia uma meta especial definida por nome/e-mail. Ela foi removida; metas vêm apenas do cargo e dos campos de configuração.

## Comportamento implementado

- O sucesso depende somente da confirmação de `inspections/{id}`.
- Auditoria e notificação são executadas depois e não bloqueiam a inspeção principal.
- A confirmação possui limite de 12 segundos. Em demora, falta de rede ou permissão, o formulário sai de **Salvando** com mensagem clara e mantém o rascunho.
- O mesmo ID estável do rascunho é reutilizado na tentativa seguinte, evitando duplicidade.
- Todo `undefined` é removido recursivamente; fotos e rotações sempre são arrays.
- O mês vem exclusivamente de `data`. `updatedAt` e `mesReferencia` não mudam a competência.
- Em setembro, o modo automático inicia setembro zerado e passa a atualizar em tempo real. Julho e agosto continuam disponíveis no filtro.
- A classificação da inspeção usa, nesta ordem: área/localidade, contrato e `grupoContrato` canônico. Nunca usa o supervisor para decidir o contrato da inspeção.
- Área Vale prevalece no painel Vale; áreas VLI prevalecem no painel VLI.
- Em **Todos os contratos**, o Dashboard mostra Meta Vale, Meta VLI e Total Geral. Em **Vale** ou **VLI**, não mostra total combinado.
- O Farol continua com blocos independentes por contrato e usa o mesmo mês operacional do Dashboard.
- DIAL e Desvio Comportamental permanecem categorias separadas.
- Líder de Equipe permanece com meta 4/semana e 16/mês; demais metas configuradas são preservadas.
- O rodapé ocupa uma linha própria e a barra de ações do formulário permanece acima dele.

## Arquivos alterados

- `src/App.tsx`
- `src/components/DashboardView.tsx`
- `src/components/LancarInspecaoView.tsx`
- `src/services/db.ts`
- `src/utils/firestorePayload.ts` (novo)
- `src/utils/inspectionUtils.ts`
- `src/utils/operational.ts`
- `tests/regression.test.tsx`

`package.json`, `package-lock.json`, `netlify.toml`, regras do Firestore e configuração do Firebase não foram alterados.

## Validações executadas

- 20 testes de regressão: **20 aprovados, 0 falhas**.
- `npx --no-install tsc --noEmit`: **aprovado, 0 erros**.
- `npm run build`: **aprovado**.
- Build Netlify preservado: `npm run build`, publicação em `dist`, fallback SPA e cache correto.

Os testes cobrem: 400/1205 registros sem corte, julho após agosto, mês futuro zerado, IDs históricos preservados, separação Vale/VLI, `undefined`, demora de confirmação, permissão negada e falha de notificação sem bloquear a inspeção.

## Integridade e segurança

- Nenhuma inspeção, usuário, supervisor ou histórico foi apagado.
- Nenhum documento do Firestore foi alterado durante esta correção.
- Nenhuma regra do Firestore foi alterada ou publicada.
- Firebase Authentication não foi alterado.
- Nenhum push, deploy ou publicação foi realizado.

## Teste manual após atualizar o Studio/Netlify

1. Entrar com um colaborador e lançar um DSS sem fotos.
2. Lançar uma inspeção com foto e confirmar que sai de **Salvando**.
3. Selecionar julho de 2026 e conferir os registros cuja `data` pertence a julho.
4. Abrir Vale e confirmar que não há localidades VLI; repetir no VLI.
5. Abrir **Todos os contratos** e conferir os três blocos de meta: Vale, VLI e Total Geral.
6. Abrir setembro no Dashboard e no Farol: o mês começa zerado e recebe novos lançamentos em tempo real.

Se uma gravação principal retornar `permission-denied`, será necessário conferir a regra já publicada para `inspections`; esta versão não publica nem contorna regras de segurança.
