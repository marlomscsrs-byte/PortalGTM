# Alterações desta entrega

- Refinamento visual da interface com cartões, tabelas, botões, navegação e estados mais consistentes.
- Fundo do login mantém a imagem inteira centralizada.
- Apenas o ID definido por `ADMIN_ID` (configurar como `284` no Render) recebe permissão de administrador técnico.
- Comandante e Subcomandante podem aprovar/rejeitar cadastros e editar perfis, conforme validação no servidor.
- Cadastros públicos solicitam entrada como Probatório; promoção de cargo é feita por autoridade autorizada.
- Tela de efetivo passa a exibir ação de edição de perfil para usuários autorizados.
- API `/api/auth/me` atualiza os dados e permissões da sessão a partir do banco.
- QRU/Discord, ponto, dashboard, hierarquia e Material de Apoio preservados.
