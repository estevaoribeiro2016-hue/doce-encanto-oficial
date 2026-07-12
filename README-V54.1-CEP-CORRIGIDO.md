# Doce Encanto V54.1 — CEP corrigido

Base: V54.1 funcional enviada pelo usuário.

Alterações desta entrega:
- consulta automática ao completar os 8 números do CEP;
- ViaCEP por fetch;
- BrasilAPI como segunda fonte;
- ViaCEP por JSONP como terceira tentativa para contornar bloqueios de navegador/CORS;
- tratamento de digitação, colagem, alteração e saída do campo;
- cache do site atualizado para impedir carregamento de JavaScript antigo;
- nenhuma integração de Mercado Pago adicionada;
- nenhuma exigência de e-mail no checkout.

PIX permanece fixo e o pedido continua com Supabase e WhatsApp conforme a V54.1.
