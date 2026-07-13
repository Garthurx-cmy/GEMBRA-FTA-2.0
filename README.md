# GEMBA FTA — VLI e Vale

Aplicação React/Vite integrada ao Firebase Authentication, Firestore e Firebase Storage.

## Atualizações desta versão

- Jhonata Gonçalves dos Santos configurado como Administrador, com acesso operacional para lançar inspeções;
- meta individual de Jhonata: 4 inspeções por semana e 16 por mês;
- supervisores operacionais com meta padrão de 7 por semana e 28 por mês;
- meta VLI distribuída entre DSS, AR, LVCC, DIAL, Desvio Estrutural, Notificação e Interdição;
- metas individuais respeitadas no Dashboard, Ranking e Farol GEMBA;
- três novos usuários Vale adicionados ao Firebase;
- nove áreas de atuação oficiais;
- contratos VLI, Trecho/TPS, Vale Sucateamento e Vale Andaime;
- login por Firebase Authentication e troca obrigatória de senha no primeiro acesso;
- fotos enviadas ao Firebase Storage;
- Firestore como fonte única dos dados em tempo real.

## Desenvolvimento

```bash
npm install
npm run lint
npm run dev
```

## Build

```bash
npm run build
```

## Publicação das regras

Com a Firebase CLI autenticada no projeto `gemba-fta`:

```bash
firebase deploy --only firestore:rules,storage
```

## Netlify

O arquivo `netlify.toml` publica a pasta `dist` e contém o redirecionamento necessário para a aplicação React.

Senhas temporárias não são armazenadas no repositório.
