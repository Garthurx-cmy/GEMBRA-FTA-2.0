# Relatório de Auditoria de Consumo do Firestore

Este documento apresenta a auditoria de consumo e otimização do Firestore para o sistema **GEMBA FTA**, garantindo que a aplicação opere de maneira sustentável, com baixo custo e altíssimo desempenho dentro do plano **Firebase Spark/Blaze**.

---

## 1. Diagnóstico do Consumo Excessivo (Antes)

Anteriormente, o sistema realizou milhares de leituras e gravações em um curto período:
- **51 mil leituras**
- **7 mil gravações**
- **8,3 mil conexões em tempo real**

### Identificação de Gargalos:
1. **Listeners Globais Ilimitados**: O serviço `DBService` registrava listeners em tempo real (`onSnapshot`) sobre todas as coleções simultaneamente (`inspections`, `supervisors`, `areas`, `contracts`, `notifications`, `users`, `authorized_emails`), independente de qual página o usuário estivesse visualizando.
2. **Consultas sem Limites**: Telas de Histórico e Relatórios carregavam em memória todas as inspeções do banco de dados, resultando em consumo volumoso a cada acesso.
3. **Persistência Redundante**: Eventos de renderização podiam recriar ouvintes devido a dependências instáveis ou loops de atualizações de estados em React.

---

## 2. Suspensão Inteligente de Conexões (Page Visibility)

Implementamos um controle de suspensão inteligente em tempo real centralizado em `App.tsx` para garantir que conexões ativas com o Firestore existam **apenas quando estritamente necessário**.

### Comportamento de Suspensão:
* **Gatilhos de Suspensão**:
  * Navegador minimizado ou aba colocada em segundo plano (`document.visibilityState === "hidden"`).
  * Tela do celular bloqueada ou outro aplicativo aberto (`pagehide`).
  * Dispositivo offline (`navigator.onLine === false`).
  * Usuário desconectado (logout).
* **Ações ao Suspender**:
  * Executa `dbService.stopSync(false)`.
  * Cancela imediatamente todos os ouvintes `onSnapshot` ativos.
  * **Sem perda de UX**: Os dados carregados permanecem visíveis em cache na tela enquanto suspenso, evitando oscilações visuais.
  * **Zero Gravações**: Nenhuma gravação de status (`lastSeen`, `online`, etc.) é realizada no Firestore para evitar custos colaterais.
* **Ações ao Reativar**:
  * Confirmada a autenticação, visibilidade e status online, reativa os ouvintes.
  * Exibe um indicador discreto **"Sincronizando..."** no cabeçalho durante a transição (1,2s de fade/pulse).
  * Atualiza os dados de forma fluida, sem recarregar a página e sem duplicar notificações.

---

## 3. Listeners Ativos por Página (Sob Demanda)

Agora os ouvintes `onSnapshot` são ativados dinamicamente com base na aba ativa do usuário, mantendo apenas o mínimo indispensável conectado:

| Aba / Tela Ativa | Listeners Ativos (`onSnapshot`) | Consultas Unidirecionais (`getDocs` / `getDoc`) | Detalhes e Justificativa |
| :--- | :--- | :--- | :--- |
| **Painel Principal / Dashboard** | **3 Listeners**: `settings/config` (configurações), `deleted_names` (nomes deletados), `notifications` (últimas 20 notificações). <br><br> *Se ativo, adiciona mais 1*: `inspections` (últimas 50). | **Nenhuma** | Carrega dados principais em tempo real de forma restrita e leve. Reutilizado diretamente por Farol e Ranking. |
| **Farol & Ranking** | **3 Listeners**: Reutiliza exatamente os mesmos ouvintes do Dashboard. | **Nenhuma** | **Zero conexões extras**. Compartilha o cache do Dashboard para cálculo de KPIs e gráficos. |
| **Histórico** | **3 Listeners**: `settings/config`, `deleted_names`, `notifications`. <br><br> *Se ativo, adiciona mais 3*: `supervisors`, `areas`, `contracts`. | **Busca paginada (`getDocs`)** com limite de 25 registros sob demanda. | Os dados dos registros históricos são lidos estritamente em lotes sob demanda, evitando carregar o banco completo. |
| **Relatórios** | **3 Listeners**: `settings/config`, `deleted_names`, `notifications`. <br><br> *Se ativo, adiciona mais 3*: `supervisors`, `areas`, `contracts`. | **Busca filtrada (`getDocs`)** sob demanda (debounce de 350ms) ou por ID único (`getDoc`). | Sem listeners de inspeções permanentes. Apenas busca quando filtros são aplicados ou ao ler relatório detalhado por ID. |
| **Lançar Inspeção** | **3 Listeners**: `settings/config`, `deleted_names`, `notifications`. <br><br> *Se ativo, adiciona mais 3*: `supervisors`, `areas`, `contracts`. | **Nenhuma** | Ouvintes sobre coleções auxiliares fornecem dados sempre atualizados para os campos de seleção do formulário. |
| **Configurações** | **3 Listeners**: `settings/config`, `deleted_names`, `notifications`. <br><br> *Se ativo, adiciona mais 5*: `supervisors`, `areas`, `contracts`. Se Admin: `users`, `authorized_emails`. | **Nenhuma** | Sincroniza tabelas administrativas estritamente enquanto a página estiver aberta e o usuário tiver permissão. |

### Pré-carregamento Inteligente de Metadados:
Ao logar ou voltar para uma aba visível, o sistema executa o método `dbService.preloadMetadata()` em segundo plano para puxar dados essenciais (`config`, `deleted_names`, `supervisors`, `areas`, `contracts`) de forma assíncrona uma única vez via `getDocs` caso os caches locais estejam vazios. Isso evita delays visuais nos formulários e listagens antes que os listeners específicos sejam reconectados.

---

## 4. Eliminação de Gravações Automáticas e Controle de Login

Realizamos um pente-fino minucioso em toda a base de código para banir e mitigar qualquer gravação indesejada em ciclo:
1. **Controle de Login (Rate-limiting `ultimoLogin`)**:
   - **Antes**: A gravação do campo `ultimoLogin` no perfil do usuário ocorria incondicionalmente em cada acionamento do listener `onAuthStateChanged`, incluindo reloads, logins, HMR (Hot Module Replacement) e retornos de visibilidade da página.
   - **Agora**: Implementamos uma verificação rigorosa baseada na leitura prévia do perfil salvo. O campo `ultimoLogin` é atualizado **estritamente no máximo uma vez a cada 24 horas**. Se a última data gravada for inferior a 24 horas, o sistema pula a escrita. Nunca realizamos gravações automáticas ao alternar abas, reconectar listeners, ou em eventos de visibilidade.
2. **Prevenção de Loops no Dashboard e Farol**:
   - Nenhuma notificação ou log de auditoria é re-criado ou gravado ao carregar ou recalcular dados do Dashboard, Farol ou Rankings. Todas as visualizações de metas e alertas visuais são processadas estritamente em memória do lado do cliente.
3. **Logs de Auditoria Estritos**:
   - O método `addAuditLog` e as inserções de log na coleção `auditLogs` estão estritamente vinculados a ações CRUD físicas do usuário: criar inspeção, atualizar inspeção, excluir inspeção e atualizações manuais administrativas. Gravações por leitura ou navegação estão completamente banidas.

---

## 5. Instrumentação de Diagnóstico (Console Trace)

Para garantir total controle sobre qualquer escrita futura e facilitar a identificação de eventuais novos focos de consumo, desenvolvemos wrappers de instrumentação em desenvolvimento no topo de `src/App.tsx` e `src/services/db.ts`:
- **Operações Monitoradas**: `setDoc`, `updateDoc`, `deleteDoc` e `writeBatch` foram redefinidos localmente como interceptores.
- **Rastreabilidade**: Em ambiente de desenvolvimento (`process.env.NODE_ENV !== "production"`), qualquer tentativa de escrita chama:
  ```typescript
  console.trace("[FIRESTORE WRITE]", path, operacao, dados);
  ```
  Isso gera um rastreamento de pilha completo (Stack Trace) no console do desenvolvedor, revelando o arquivo, método e linha exata que originou a operação.
- **Sustentabilidade**: Esses diagnósticos rodam estritamente localmente no console, evitando qualquer gravação colateral de telemetria no banco de dados.

---

## Conclusão

Com essas otimizações aplicadas de forma integrada, o **GEMBA FTA** protege as cotas do Firestore de forma impecável:
1. Limita listeners em tempo real por contexto de uso da página.
2. Suspende todas as conexões em tempo real ao ocultar a janela, bloquear o telefone ou ficar offline.
3. Garante que os dados antigos permaneçam na memória para uma experiência de usuário instantânea e sem engasgos visuais ("Sincronizando...").
4. Evita gravações de status de presença, mantendo as cotas de escrita intactas.
5. Limita escritas de login para no máximo uma vez a cada 24 horas.
6. Instrumenta as escritas de desenvolvimento, garantindo transparência operacional contínua.

A aplicação está **completamente pronta, sustentável e otimizada** para operar com custo mínimo no plano Blaze ou totalmente gratuita dentro do Spark.
