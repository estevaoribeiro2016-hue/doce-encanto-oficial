# Doce Encanto V54 — base real V51

Esta versão foi construída sobre os arquivos da V51 estável.

## Para atualizar um banco que já usa a V51
1. Faça backup do projeto publicado e, no Supabase, do banco.
2. Execute somente `update-v54.sql` em Supabase > SQL Editor.
3. Publique os arquivos desta pasta no GitHub/Vercel.
4. Recarregue com Ctrl+F5.

## Para uma instalação nova
Execute `supabase-schema.sql` completo.

## Testes obrigatórios antes da divulgação
- pedido de retirada;
- pedido de entrega em Pindorama, Jardim Filadélfia e Novo Glória;
- cadastro de um novo bairro e confirmação da taxa no checkout;
- mudança de status para Pronto e impressão 58 mm;
- mudança para Entregue e conferência no faturamento mensal;
- cancelamento e devolução do estoque;
- cadastro biométrico em HTTPS.

A impressão usa a janela de impressão do navegador. Para impressão totalmente automática sem diálogo, é necessário configurar o navegador/computador em modo quiosque.
