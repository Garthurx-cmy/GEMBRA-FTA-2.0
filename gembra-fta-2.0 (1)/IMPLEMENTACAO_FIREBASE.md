# GEMBA FTA — implantação Firebase, GitHub e Netlify

## O que foi corrigido

- Firestore passou a ser a fonte oficial dos dados.
- Removidos dados simulados, seed automático e restauração de fábrica.
- Login real por Firebase Authentication (e-mail e senha).
- Opção “Lembrar de mim” com persistência local ou por sessão.
- Troca obrigatória de senha quando `primeiroAcesso` ou `deveAlterarSenha` estiverem como `true`.
- Sincronização em tempo real com `onSnapshot()` após o login.
- Fotos enviadas ao Firebase Storage e gravadas como URLs nas inspeções.
- Limite de 3 fotos antes e 3 fotos depois.
- Impressão abre somente o documento do relatório.
- PDF continua usando apenas a área do relatório.
- Cadastros impedem duplicidade por e-mail, nome, código do contrato ou localidade.
- Lixeiras aguardam a exclusão real do Firestore.
- Criada ferramenta de correção de duplicidades na área de Backup.

## 1. Firebase Authentication

Ative **E-mail/Senha** no Firebase Console.

A conta do Arthur já foi validada no Authentication e vinculada ao documento correspondente em `users/{uid}`.

Documento sugerido:

```json
{
  "nome": "Arthur Emanoel G. Santos",
  "email": "arthuremanoelgsantos@gmail.com",
  "perfil": "Desenvolvedor/Admin",
  "cargo": "Desenvolvedor do Sistema",
  "ativo": true,
  "primeiroAcesso": false,
  "deveAlterarSenha": false
}
```

Depois, Arthur poderá usar **Configurações > Usuários & Permissões > Adicionar usuário** para criar as demais contas com senha temporária. O usuário será obrigado a criar sua senha pessoal no primeiro acesso.

## 2. Usuários a cadastrar

- Dener Rodrigues de Souza — d.souza@grupofta.com.br — Supervisor
- Jhonata Gonçalves dos Santos — j.santos@grupofta.com.br — Administrador, autorizado a lançar inspeções, meta 4/semana e 16/mês
- Wagner Monteiro — w.monteiro@grupofta.com.br — Supervisor
- Klayton Anderson Sabino — k.sabino@grupofta.com.br — Supervisor
- Murilo Henrique Gonçallo Nascimento — m.nascimento@grupofta.com.br — Supervisor
- Jose Mauricio Dos Santos Junior — j.junior@grupofta.com.br — Supervisor
- Carijunio de Jesus Morais — c.morais@grupofta.com.br — Supervisor
- Valdeir Santos de Souza — v.souza@grupofta.com.br — Supervisor
- Maicon dos Santos Quintino — m.quintino@grupofta.com.br — Gestor

Não compartilhe senhas definitivas. Cadastre uma senha temporária e mantenha `primeiroAcesso: true`.

## 3. Regras

Publique `firestore.rules` no Firestore e `storage.rules` no Firebase Storage.

As regras exigem autenticação. Perfis administrativos aceitos:

- `Desenvolvedor/Admin`
- `Administrador`
- `desenvolvedor`
- `admin`

## 4. Duplicidades antigas

No sistema, abra:

**Configurações > Banco de Dados & Backup > Corrigir Cadastros Duplicados**

A ferramenta remove duplicidades em:

- supervisores;
- localidades;
- contratos;
- e-mails autorizados.

Ela não apaga inspeções.

## 5. GitHub e Netlify

Suba o conteúdo desta pasta para um repositório GitHub. No Netlify:

- Build command: `npm run build`
- Publish directory: `dist`

O GitHub e o Netlify armazenam somente o código. Os dados e fotos permanecem no Firebase após qualquer novo deploy.

## 6. Testes essenciais

1. Abra em dois navegadores com usuários diferentes.
2. Lance uma inspeção em um navegador.
3. Confirme a atualização no Dashboard e Histórico do outro sem F5.
4. Envie fotos e confirme que aparecem no Histórico, relatório e PDF.
5. Teste “Lembrar de mim” marcado e desmarcado.
6. Teste edição e exclusão usando as lixeiras.
7. Faça um novo deploy no Netlify e confirme que os dados continuam salvos.
