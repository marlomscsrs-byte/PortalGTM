# Portal Operacional G.T.M. Villa

Primeira etapa da reestruturação: interface modular inspirada na organização do Sistema dos Instrutores, identidade militar preta/cinza, backend Node.js/Express no Render e PostgreSQL no Neon.

## Funcionalidades desta etapa
- Login por ID e senha, sessão persistida no PostgreSQL.
- Solicitação de cadastro com ID, nome, cargo e senha.
- Aprovação administrativa; ao aprovar, cria/atualiza o integrante na tabela `users`.
- Dashboard com efetivo, ativos, pessoas em serviço e solicitações pendentes.
- Efetivo com pesquisa e filtro.
- Bater ponto (entrada/saída) e histórico individual.
- Endpoint `/api/health`.

## Ainda será migrado em etapas seguintes
Manual de Conduta, QRU/Registro de Prisão e envio ao Discord, veículos, uniformes, armamentos, cursos e demais módulos do portal antigo. Mantenha o portal atual disponível até validar os módulos novos. Nenhum dado da planilha é importado automaticamente.

## Neon
1. Crie projeto PostgreSQL no Neon.
2. Execute todo `db/schema.sql` no SQL Editor.
3. Copie a connection string para `DATABASE_URL` no Render.

## Render
Use `npm install` no build e `npm start` no start. Configure `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_ID`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `NODE_ENV=production`. Defina uma senha forte e exclusiva antes do deploy. O primeiro administrador só é criado se o ID ainda não existir.

## GitHub
Envie os arquivos deste ZIP para o repositório `marlomcsrs-byte/GTM`. Não envie `.env` nem credenciais.

## Migração da hierarquia
Faça backup da planilha antes. Exporte `Hierarquia-GTM` para CSV e revise duplicados. Mapeamento: `ID -> passport_id`, `NOMES -> full_name`, `BADGE -> badge`, `PATENTES -> rank`, `CARGOS -> role`, `STATUS -> status`, `DATA DE ENTRADA -> entry_date`. Importe os dados revisados para `users` antes de abrir o portal à equipe. Não importe senhas em texto aberto; cada integrante deverá cadastrar senha ou passar por redefinição segura.

## Teste antes de trocar o site público
- `/api/health` retorna `ok`.
- Login administrativo funciona.
- Pedido aparece em Aprovações.
- Aprovação adiciona ao efetivo e libera login.
- Rejeição não cria usuário aprovado.
- Entrada/saída aparece no histórico.
- Conta não administrativa não acessa Aprovações.
- Planilha antiga permanece intacta até concluir a migração.

## Segurança
O navegador não acessa o banco diretamente. Nunca publique a connection string, o segredo de sessão ou a senha administrativa no GitHub. O controle de cadastro de permissões será ampliado nas próximas etapas.
