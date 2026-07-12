# Doce Encanto V55.1 — Correção Vercel

Esta versão remove o arquivo `vercel.json`, que estava fazendo a Vercel interromper o deployment com a mensagem **Invalid vercel.json file provided**.

O projeto é um site estático e pode ser publicado diretamente pela Vercel sem esse arquivo.

## Publicação

1. Remova do repositório antigo o arquivo `vercel.json`, caso ele ainda esteja presente.
2. Envie todos os arquivos desta versão para a raiz do repositório.
3. Na Vercel, clique em **Redeploy** ou aguarde o novo deployment automático.
4. Framework Preset: **Other**.
5. Build Command: vazio.
6. Output Directory: vazio.

A correção não altera o Supabase, pedidos, estoque, favoritos, histórico, faturamento, Pix, CEP ou WhatsApp.
