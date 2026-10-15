# Portal Operacional G.T.M. Villa

Projeto atualizado com as três fotografias fornecidas para o Manual de Conduta.

## Imagens adicionadas
- `public/manual-patrulhamento.png` — seção 5.1, Durante patrulhamento.
- `public/manual-abordagem.png` — seção 5.2, Durante abordagem.
- `public/manual-estacionamento.png` — seção 5.3, Estacionamento (foto da equipe/motocicletas, conforme solicitado).

As imagens abrem em tamanho maior ao clicar. Os demais módulos e arquivos do portal foram mantidos a partir dos arquivos enviados.

## Deploy
Mantenha a estrutura de pastas e publique os arquivos no repositório conectado ao serviço Render. Preserve as variáveis de ambiente já configuradas no Render; não publique segredos no GitHub.

## Encerramento manual de ponto
- No Relatório de Jornada, Administrador, Comandante e Subcomandante podem usar **Fechar ponto** nas jornadas que ainda estão abertas.
- A saída é registrada com a data e hora atuais. A ação pede confirmação e gera registro de auditoria com o responsável e o integrante afetado.
- O endpoint de encerramento exige permissão de gestão no servidor; usuários comuns não podem encerrar jornadas de outras pessoas.

## Favicon G.T.M.
- O favicon e o ícone de tela inicial usam o brasão `public/gtm-emblem.webp`.
- A referência está no `<head>` de `public/index.html`; o parâmetro de versão ajuda a atualizar o cache do navegador.
