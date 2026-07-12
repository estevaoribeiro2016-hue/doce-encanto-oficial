# Doce Encanto V55 — Completa

Base oficial: V54.7 funcional.

## Novidades
- Favoritos de sabores na área do cliente.
- Histórico de pedidos por telefone.
- Botão para repetir pedido recente com validação do estoque atual.
- Estoque inteligente preservado: baixa na finalização, bloqueio por falta, devolução no cancelamento, mínimo e movimentações.
- Confirmação obrigatória antes de cancelar.
- Botão para marcar/desmarcar pedido de teste.
- Pedidos de teste não entram no faturamento real.
- Usuário Teteu pode corrigir o valor considerado no faturamento.
- Correções financeiras ficam registradas em revenue_adjustments.

## Instalação obrigatória
1. Abra o Supabase > SQL Editor.
2. Execute o arquivo `ATUALIZACAO-V55.sql` uma única vez.
3. Publique todos os arquivos desta pasta no mesmo projeto da V54.7.
4. Faça recarregamento completo do navegador (Ctrl+F5).

A configuração do Supabase, Pix, WhatsApp, CEP, fretes e logins foi preservada da V54.7.
