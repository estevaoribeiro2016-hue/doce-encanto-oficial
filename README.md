# Doce Encanto V51 Estável

Versão baseada na V50 conectada ao Supabase, com correções de estabilidade no checkout.

## Correções principais
- Eliminado o erro `Maximum call stack size exceeded` causado por atualização recursiva do frete/total.
- CEP com consulta em duas fontes: ViaCEP e BrasilAPI.
- Debounce no campo de CEP para evitar travamentos e requisições repetidas.
- Base local de emergência para CEPs conhecidos da região.
- Finalização do pedido mantém Supabase, desconto de estoque, pedidos pendentes e WhatsApp.
- Cache atualizado para evitar que a Vercel/navegador carregue JavaScript antigo.

## Publicação
Extraia o ZIP e envie todos os arquivos internos para a raiz do repositório no GitHub. Após o deploy, faça uma atualização forçada da página ou limpe os dados do site uma vez.

## Teste recomendado
1. Adicione uma trufa ou promoção.
2. Vá ao checkout e selecione Entrega.
3. Digite um CEP válido e aguarde o preenchimento.
4. Complete o número.
5. Finalize e confirme que o pedido entra no Supabase e o WhatsApp abre.
