# Alterações desta entrega

- Refinamento visual da interface com cartões, tabelas, botões, navegação e estados mais consistentes.
- Fundo do login mantém a imagem inteira centralizada.
- Apenas o ID definido por `ADMIN_ID` (configurar como `284` no Render) recebe permissão de administrador técnico.
- Comandante e Subcomandante podem aprovar/rejeitar cadastros e editar perfis, conforme validação no servidor.
- Cadastros públicos selecionam um dos sete cargos; solicitações para Comandante e Subcomandante exigem aprovação do administrador do sistema.
- Tela de efetivo passa a exibir ação de edição de perfil para usuários autorizados.
- API `/api/auth/me` atualiza os dados e permissões da sessão a partir do banco.
- QRU/Discord, ponto, dashboard, hierarquia e Material de Apoio preservados.

## Dashboard refinado — 13/10/2026
- Hero Banner ampliado e com saudação, status operacional e botão de ponto organizados em áreas distintas.
- Indicadores com ícones, descrições e quatro cartões; cadastros pendentes aparecem para Administrador, Comandante e Subcomandante.
- Corrigida a exibição das áreas com classe `manager` para usuários com permissão de gestão.
- Marcações recentes reorganizadas com avatar, ID, entrada, saída e situação.
- Minha jornada agora mostra status e duração do turno atualizada a cada minuto.
- Adicionados atalhos para QRU, Hierarquia, Manual de Conduta e Material de Apoio.
- Ajustes responsivos para desktop, tablet e celular.
