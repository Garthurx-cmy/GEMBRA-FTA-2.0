# Revisão Completa — GEMBA FTA
Data: 26/08/2026

## Correções aplicadas
1. ConfiguracoesView: removido import inexistente `NAO_PARTICIPANTES_FAROL_GEMBA`.
2. FarolGembaView: `getSupervisorMetaMensal` passou a ser importado de `operational.ts`; removida referência inexistente `FAROL_VLI_NAMES`.
3. db.ts: corrigidos campos antigos/inexistentes `observacao` e `localidade` para `observacoes`.
4. Classificação de lançamentos: `tipoLancamento` agora tem prioridade consistente em Dashboard, Histórico, Relatórios, busca global, filtros e serviços de banco, além de Farol e Ranking.
5. Líder de Equipe: deixou de ser convertido automaticamente em `supervisor`; perfil canônico agora é `Líder de Equipe`, preservando acesso operacional sem conceder permissão de supervisor por engano.
6. Usuários legados com cargo de líder: normalização recupera automaticamente o perfil `Líder de Equipe` quando o cargo indica liderança.
7. Rotina dos 13 usuários padrão: líderes são atualizados/pré-autorizados como `Líder de Equipe`; segurança permanece operacional como supervisor; todos podem continuar com `participaFarolGemba: false`.
8. Relatórios: removida a assinatura fixa de Jhonata e apagados os arquivos de imagem da assinatura do projeto.
9. Logs de desenvolvimento: trocado `process.env.NODE_ENV` em código de navegador por `import.meta.env.DEV`, padrão do Vite.

## Validações executadas
- Comparação integral com o ZIP original.
- Verificação de imports relativos: nenhum arquivo relativo ausente.
- Verificação de símbolos quebrados conhecidos: nenhum restante.
- Verificação de referências a campos antigos: nenhuma restante.
- Verificação sintática TypeScript/JSX: sem erro de sintaxe detectado.
- Revisão das regras do Firestore e coerência dos perfis.
- Revisão dos fluxos principais: autenticação, lançamento, autosave, Dashboard, Histórico, Ranking, Farol, Relatórios, Exportações e Configurações.

## Observação de build
O ambiente de revisão não conseguiu baixar dependências do npm (registro externo indisponível), portanto o `npm run build` completo não pôde ser executado localmente. O projeto está configurado para o Netlify executar `npm run build` e publicar `dist`. A etapa final de compilação deve ser confirmada pelo log do Netlify após o commit.

## Pontos operacionais importantes
- O sincronismo principal carrega até 1000 inspeções por listener. Para volumes superiores, Dashboard/Ranking podem exigir evolução de paginação/agregação no futuro.
- Fotos são armazenadas inline no Firestore; o formulário limita o total a 650 KB e valida o documento contra 1 MiB.
- Registros legados sem `grupoContrato` precisam passar pela rotina de classificação/backfill para aparecer corretamente em consultas filtradas por Vale/VLI.
