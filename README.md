# Portal Operacional G.T.M. Villa — versão refinada

## Atualização desta versão
- Refinamento visual geral: painéis, cartões, botões, tabelas, estados, hierarquia e navegação.
- Login com imagem de fundo preenchendo a tela e formulário centralizado.
- ID definido por `ADMIN_ID` no Render é o único administrador técnico; mantenha esse valor como `284` no serviço Render.
- Comandante e Subcomandante podem aprovar/rejeitar cadastros e editar perfis operacionais.
- A edição de perfis é verificada no backend; usuários comuns não podem alterar integrantes.
- Novos cadastros públicos entram como Probatório; cargos superiores devem ser atribuídos por autoridade autorizada.
- Mantidos dashboard, login, QRU/Discord, ponto, hierarquia e materiais.

## Publicação
1. Envie o conteúdo desta pasta ao repositório usado pelo serviço `portal-gtm`, mantendo `server.js`, `package.json`, `render.yaml`, `db/` e `public/` na raiz correta.
2. No Render, confirme `ADMIN_ID=284`, `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD` e `DISCORD_WEBHOOK_QRU`. Nunca publique segredos no GitHub.
3. Faça o deploy e teste login, ponto, QRU/Discord, aprovações como ID 284 e como Comandante/Subcomandante, e edição de perfil.

## Observações de segurança
- A flag administrativa é sincronizada com o ID definido em `ADMIN_ID` no início do servidor. Se o ambiente Render estiver configurado como `284`, apenas esse ID será administrador técnico.
- A edição do perfil do ID administrativo e a atribuição dos cargos Comandante/Subcomandante são restritas ao administrador técnico.
- O backend ainda depende do schema PostgreSQL já existente; nenhuma tabela nova é necessária para esta atualização.


## Telefone no perfil
A aba Meu perfil permite que cada integrante informe/atualize seu telefone. O campo formata automaticamente telefones brasileiros como `(00) 00000-0000` (celular) ou `(00) 0000-0000` (fixo). O telefone é opcional e é armazenado na coluna `users.phone`. O servidor cria essa coluna automaticamente no bootstrap, sem exigir execução manual de SQL.


### Telefone do RP
O perfil permite cadastrar telefone fictício do personagem no padrão `XXX-XXX` (seis dígitos). Não use telefone real.


## Hero Banner do Dashboard
A imagem `public/hero-gtm.webp` é utilizada como fundo do cartão de boas-vindas no Dashboard. O texto e o botão continuam dinâmicos no HTML. Nenhuma variável de ambiente ou migração de banco é necessária para esta alteração.

### Dashboard refinado
O Dashboard apresenta Hero Banner, quatro indicadores (o cartão de cadastros pendentes é exibido somente para usuários com permissão de gestão), marcações recentes, duração do ponto aberto e atalhos para QRU, Hierarquia, Manual de Conduta e Material de Apoio. O cálculo da duração é apenas visual e usa o horário de entrada já retornado pela API de ponto.
