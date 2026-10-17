# Portal Operacional G.T.M. Villa

Versão com ajustes de jornada no Relatório de Jornada.

## Ajustes de jornada
- Ações disponíveis somente para administrador, Comandante e Subcomandante, com autorização validada também no backend.
- **Fechar ponto:** encerra uma jornada aberta usando o horário atual.
- **Ajustar horários:** corrige entrada e saída de jornadas abertas ou concluídas; saída em branco mantém o ponto aberto.
- Toda correção exige justificativa e grava o responsável, integrante, horário antigo, horário novo e justificativa na tabela `audit_log`.
- A área **Histórico de ajustes** exibe os últimos 100 fechamentos manuais e correções.
- As alterações usam a tabela existente `clock_entries` e não exigem migração de banco.

## Implantação
1. Substitua os arquivos no repositório pelo conteúdo deste pacote.
2. Mantenha as variáveis de ambiente já configuradas no Render.
3. O `render.yaml` mantém `/api/health` como health check.

## Testes executados nesta entrega
- `node --check server.js`
- `node --check public/app.js`

Não foi possível testar ações reais contra o banco de produção nesta sessão. Faça uma verificação com uma conta de gestão e um ponto de teste após o deploy.
