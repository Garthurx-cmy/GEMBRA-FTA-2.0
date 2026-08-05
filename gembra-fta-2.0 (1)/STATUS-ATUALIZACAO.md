# Status da atualização — 13/07/2026

## Perfis

- Arthur Santos: Desenvolvedor/Admin, acesso administrativo e operacional irrestrito.
- Jhonata Gonçalves dos Santos e Maicon dos Santos Quintino: Gestores, podem lançar e editar inspeções, acessar todos os contratos, dashboards, relatórios e Ranking.
- Supervisores: podem lançar, editar, concluir e alterar status, além de acessar Dashboard, Histórico, Ranking, Farol, relatórios, fotos, impressão e exportação. Não administram cadastros ou permissões.

## Metas e indicadores

- Dener, Wagner, Klayton, Murilo e José Mauricio: 7 inspeções por semana e 28 por mês.
- Carijunio e Valdeir: 4 inspeções por semana e 16 por mês.
- Jhonata e Maicon: 4 inspeções por semana e 16 por mês.
- Farol exibe somente os cinco supervisores VLI definidos acima.
- Ranking inclui supervisores e gestores, respeita a meta individual e ordena por pontuação, percentual, quantidade e inspeção mais recente.
- Semana operacional usa uma janela móvel de sete dias, encerrando na data atual (em 13/07/2026: 07/07/2026 a 13/07/2026).

## Localidades

Ipatinga, Itacibá, Belo Oriente, Santa Bárbara, Ouro Branco, João Monlevade, Trecho TPS, Sucateamento Vale e Andaime Vale.

## Persistência e segurança

- Firebase Authentication para login.
- Cloud Firestore como fonte única dos dados, com listeners em tempo real.
- Firebase Storage para fotos e evidências.
- Trilha de auditoria para criação, edição e exclusão de inspeções.
- Backup JSON administrativo com inspeções, cadastros, usuários, notificações e configurações.
- Regras do Firestore incluídas no pacote e prontas para publicação.

## Histórico e navegação

- Ação “Duplicar inspeção” removida.
- Impressão abre somente o relatório da inspeção selecionada, com logo, dados, fotos, tratativa, status e responsável.
- Menu lateral expande ao passar o mouse e recolhe automaticamente ao retirar.
