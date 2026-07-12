# Doce Encanto V54.2 LIMPA

Base: V54.1 funcional.

Alteração principal:
- o checkout usa a nova função Supabase `create_order_v54_clean`;
- não existe validação de e-mail para o cliente;
- não existe Mercado Pago, preferência, webhook ou geração automática de PIX;
- mantém PIX fixo, QR Code fixo, Supabase, estoque, Central, CEP e WhatsApp.

## PASSO OBRIGATÓRIO NO SUPABASE

Antes de testar a finalização, abra o Supabase > SQL Editor, cole todo o conteúdo de:

`SUPABASE-CORRECAO-V54.2-LIMPA.sql`

e clique em **Run**.

Sem executar esse SQL, o site não encontrará a nova função limpa de pedidos.
