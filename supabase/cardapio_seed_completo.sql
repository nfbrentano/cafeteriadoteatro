-- ============================================================
-- CARDÁPIO DA CAFETERIA DO TEATRO — SEED COMPLETO DE PRODUTOS
-- Extraído integralmente do PDF oficial do cardápio atual
-- ============================================================

-- 1. Inserir ou atualizar Categorias
INSERT INTO public.categorias (id, nome, icone, ativo, descricao, ordem, updated_at)
VALUES
  ('cafes-quentes', 'Cafés Quentes', '☕', true, 'Espressos tradicionais, passados e variações quentes com grãos selecionados.', 1, now()),
  ('cafes-especiais', 'Cafés Especiais', '✨', true, 'Cappuccinos tradicionais e especiais com bordas de doces, moccas e opções exclusivas.', 2, now()),
  ('chocolate-quente', 'Chocolate Quente', '🍫', true, 'Chocolates quentes cremosos com receitas especiais e opções com chantilly.', 3, now()),
  ('cafes-gelados', 'Cafés Gelados', '🧊', true, 'Cappuccinos gelados com bordas doces, café gelado com crema e espresso tônica.', 4, now()),
  ('bebidas-geladas', 'Bebidas Geladas & Sodas', '🍹', true, 'Pink lemonade refrescante, sodas italianas artesanais e chá gelado de pêssego.', 5, now()),
  ('milk-shakes', 'Milk Shakes', '🥤', true, 'Milk shakes especiais batidos com sorvete e bordas generosas.', 6, now()),
  ('sucos-vitaminas', 'Sucos & Vitaminas', '🧃', true, 'Sucos 100% naturais sem adição de açúcar e vitaminas cremosas de frutas.', 7, now()),
  ('crepes-salgados', 'Crepes Salgados', '🥞', true, 'Massa artesanal leve e crocante recheada com queijos nobres, carnes e temperos.', 8, now()),
  ('crepes-doces', 'Crepes Doces & Panquecas', '🍓', true, 'Crepes doces recheados, mini crepes com sorvete e mini panquecas artesanais.', 9, now()),
  ('baguetes', 'Baguetes Artesanais', '🥖', true, 'Baguetes crocantes com recheios especiais gratinados no forno.', 10, now()),
  ('croissants', 'Croissants Salgados & Doces', '🥐', true, 'Croissants folhados nas versões salgadas gourmet e doces irresistíveis.', 11, now()),
  ('torradas-lanches', 'Torradas & Lanches', '🥪', true, 'Torradas completas, sanduíche natural, croque madame, queijo quente e ovos mexidos.', 12, now()),
  ('saladas', 'Saladas Especiais', '🥗', true, 'Saladas frescas e completas com mix de folhas, frango, carne e molhos da casa.', 13, now()),
  ('tacas-acai', 'Taças Especiais & Açaí', '🍨', true, 'Taças de sorvetes nobres, Floccotino e açaí com frutas frescas.', 14, now()),
  ('balcao', 'Balcão & Confeitaria', '🍰', true, 'Tortas fatiadas, bolos artesanais, pastéis assados e pães recheados do dia.', 15, now()),
  ('sem-lactose-gluten', 'Sem Lactose & Sem Glúten', '🌾', true, 'Opções sem lactose, sem glúten e linha Cheiro Verde segura para celíacos.', 16, now()),
  ('bebidas-alcoolicas', 'Bebidas com Álcool', '🥂', true, 'Espumantes, drinks clássicos como Aperol Spritz e Mimosa, cervejas e doses.', 17, now())
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  icone = EXCLUDED.icone,
  ativo = EXCLUDED.ativo,
  descricao = EXCLUDED.descricao,
  ordem = EXCLUDED.ordem,
  updated_at = now();

-- 2. Inserir ou atualizar Produtos
INSERT INTO public.produtos (id, categoria_id, nome, descricao, preco, badges, ativo, ordem, updated_at)
VALUES
  -- ------------------------------------------------------------
  -- CAFÉS QUENTES (Pág. 4 e Promoção Pág. 2)
  -- ------------------------------------------------------------
  ('cafe-passado-leite', 'cafes-quentes', 'Café Passado ou Passado com Leite', 'Opção tradicional de café passado puro ou com leite quente.', 6.90, '{}', true, 1, now()),
  ('espresso-simples', 'cafes-quentes', 'Espresso Simples 50ml', 'Dose tradicional de café espresso concentrado.', 6.90, '{"popular"}', true, 2, now()),
  ('espresso-duplo', 'cafes-quentes', 'Espresso Duplo 120ml', 'Dose dupla de café espresso encorpado.', 8.90, '{}', true, 3, now()),
  ('espresso-com-leite', 'cafes-quentes', 'Espresso com Leite 120ml', 'Espresso com leite vaporizado cremoso.', 8.90, '{}', true, 4, now()),
  ('espresso-com-chantilly', 'cafes-quentes', 'Espresso com Chantilly', 'Espresso coberto com generosa camada de chantilly fresco.', 12.90, '{}', true, 5, now()),
  ('espresso-leite-nutella', 'cafes-quentes', 'Espresso com Leite e Borda de Nutella', 'Espresso com leite vaporizado servido em taça com borda de Nutella.', 12.90, '{"popular"}', true, 6, now()),
  ('carioquinha-50ml', 'cafes-quentes', 'Carioquinha 50ml', 'Café espresso mais suave com adição de água quente.', 6.90, '{}', true, 7, now()),
  ('carioca-duplo-120ml', 'cafes-quentes', 'Carioca Duplo 120ml', 'Café carioca duplo em dose de 120ml, sabor suave.', 8.90, '{}', true, 8, now()),
  ('cafe-descafeinado-120ml', 'cafes-quentes', 'Café Descafeinado 120ml (solúvel)', 'Café descafeinado solúvel servido quentinho.', 7.00, '{}', true, 9, now()),
  ('refil-cafe-coado', 'cafes-quentes', 'Refil de Café Coado (Café à Vontade)', 'Refil de café coado para você ter mais energia. Café à vontade!', 13.90, '{"popular"}', true, 10, now()),

  -- ------------------------------------------------------------
  -- CAFÉS ESPECIAIS (Pág. 5)
  -- ------------------------------------------------------------
  ('cappuccino-brasileiro-pequeno', 'cafes-especiais', 'Cappuccino Brasileiro Pequeno 120ml', 'Mistura docinha de cacau, café, leite em pó e canela.', 10.90, '{}', true, 1, now()),
  ('cappuccino-brasileiro-grande', 'cafes-especiais', 'Cappuccino Brasileiro Grande 240ml', 'Mistura docinha de cacau, café, leite em pó e canela.', 12.90, '{"popular"}', true, 2, now()),
  ('cappuccino-brasileiro-nutella', 'cafes-especiais', 'Cappuccino Brasileiro Grande c/ Borda de Nutella 240ml', 'Cappuccino brasileiro em taça decorada com borda de Nutella.', 16.90, '{"popular"}', true, 3, now()),
  ('cappuccino-brasileiro-doce-de-leite', 'cafes-especiais', 'Cappuccino Brasileiro Grande c/ Borda de Doce de Leite 240ml', 'Cappuccino brasileiro em taça decorada com borda de doce de leite.', 16.90, '{}', true, 4, now()),
  ('cappuccino-italiano-pequeno', 'cafes-especiais', 'Cappuccino Italiano Pequeno 120ml', 'Espresso com leite vaporizado e crema de leite (sem açúcar).', 10.90, '{}', true, 5, now()),
  ('cappuccino-italiano-grande', 'cafes-especiais', 'Cappuccino Italiano Grande 240ml', 'Espresso com leite vaporizado e crema de leite (sem açúcar).', 12.90, '{}', true, 6, now()),
  ('mocca-tradicional', 'cafes-especiais', 'Mocca', 'Leite vaporizado, chocolate meio amargo e dose de espresso.', 15.90, '{"popular"}', true, 7, now()),
  ('mocca-com-nutella', 'cafes-especiais', 'Mocca com Borda de Nutella', 'Leite vaporizado, chocolate meio amargo, dose de espresso e borda de Nutella.', 17.90, '{"popular"}', true, 8, now()),

  -- ------------------------------------------------------------
  -- CHOCOLATE QUENTE (Pág. 5)
  -- ------------------------------------------------------------
  ('chocolate-quente-pequeno', 'chocolate-quente', 'Chocolate Quente Cremoso Pequeno 100ml', 'Chocolate quente artesanal cremoso e aveludado.', 11.90, '{}', true, 1, now()),
  ('chocolate-quente-grande', 'chocolate-quente', 'Chocolate Quente Cremoso Grande 240ml', 'Chocolate quente cremoso servido em taça de 240ml.', 16.90, '{"popular"}', true, 2, now()),
  ('chocolate-quente-chantilly', 'chocolate-quente', 'Chocolate Quente Grande com Chantilly 240ml', 'Chocolate quente cremoso finalizado com generosa cobertura de chantilly.', 18.90, '{"popular"}', true, 3, now()),

  -- ------------------------------------------------------------
  -- BEBIDAS GELADAS & SODAS (Pág. 6)
  -- ------------------------------------------------------------
  ('pink-lemonade', 'bebidas-geladas', 'Pink Lemonade 400ml', 'Limão, essência de frutas vermelhas, açúcar e água.', 13.90, '{"popular"}', true, 1, now()),
  ('soda-maca-verde', 'bebidas-geladas', 'Soda Italiana Maçã Verde 400ml', 'Refrescante soda italiana de maçã verde com gelo.', 13.90, '{}', true, 2, now()),
  ('soda-frutas-vermelhas', 'bebidas-geladas', 'Soda Italiana Frutas Vermelhas 400ml', 'Soda italiana artesanal sabor frutas vermelhas.', 13.90, '{"popular"}', true, 3, now()),
  ('soda-melancia', 'bebidas-geladas', 'Soda Italiana Melancia 400ml', 'Soda italiana refrescante sabor melancia.', 13.90, '{}', true, 4, now()),
  ('soda-blueberry', 'bebidas-geladas', 'Soda Italiana Blueberry 400ml', 'Soda italiana refrescante sabor blueberry (mirtilo).', 13.90, '{}', true, 5, now()),
  ('cha-gelado-pessego', 'bebidas-geladas', 'Chá Gelado de Pêssego 400ml', 'Chá gelado refrescante sabor pêssego.', 13.90, '{}', true, 6, now()),

  -- ------------------------------------------------------------
  -- CAFÉS GELADOS (Pág. 7)
  -- ------------------------------------------------------------
  ('cappuccino-gelado', 'cafes-gelados', 'Cappuccino Gelado', 'Nosso cappuccino cremoso servido gelado.', 13.90, '{"popular"}', true, 1, now()),
  ('cappuccino-gelado-nutella', 'cafes-gelados', 'Cappuccino Gelado com Borda de Nutella', 'Cappuccino gelado servido com generosa borda de Nutella.', 17.90, '{"popular"}', true, 2, now()),
  ('cappuccino-gelado-nutella-amendoim', 'cafes-gelados', 'Cappuccino Gelado c/ Borda de Nutella e Amendoim', 'Cappuccino gelado com borda de Nutella coberta de amendoim crocante.', 18.90, '{}', true, 3, now()),
  ('cappuccino-gelado-doce-leite', 'cafes-gelados', 'Cappuccino Gelado com Borda de Doce de Leite', 'Cappuccino gelado servido com borda de doce de leite.', 17.90, '{}', true, 4, now()),
  ('cappuccino-gelado-doce-leite-amendoim', 'cafes-gelados', 'Cappuccino Gelado c/ Doce de Leite e Amendoim', 'Cappuccino gelado com borda de doce de leite e amendoim crocante.', 18.90, '{}', true, 5, now()),
  ('cafe-gelado-crema', 'cafes-gelados', 'Café Gelado', 'Espresso, crema de leite e pedras de gelo.', 14.90, '{}', true, 6, now()),
  ('espresso-tonica', 'cafes-gelados', 'Espresso Tônica', 'Combinação refrescante de água tônica e dose de espresso.', 14.90, '{"novo"}', true, 7, now()),

  -- ------------------------------------------------------------
  -- MILK SHAKES (Pág. 7)
  -- ------------------------------------------------------------
  ('milkshake-chocolate-nutella', 'milk-shakes', 'Milk Shake de Chocolate com Borda de Nutella', 'Batido cremoso de sorvete de chocolate com generosa borda de Nutella.', 24.90, '{"popular"}', true, 1, now()),
  ('milkshake-creme-doce-leite', 'milk-shakes', 'Milk Shake Sorvete de Creme com Borda de Doce de Leite', 'Sorvete de creme batido servido em taça com borda de doce de leite.', 23.90, '{}', true, 2, now()),

  -- ------------------------------------------------------------
  -- CREPES SALGADOS (Pág. 9)
  -- ------------------------------------------------------------
  ('crepe-calabresa', 'crepes-salgados', 'Crepe de Calabresa', 'Calabresa fatiada, mussarela, tomate cereja, tempero verde e orégano.', 27.90, '{}', true, 1, now()),
  ('crepe-carne-panela', 'crepes-salgados', 'Crepe de Carne de Panela', 'Carne de panela desfiada bem temperada, queijo e orégano.', 31.90, '{"popular"}', true, 2, now()),
  ('crepe-carne-panela-cheddar', 'crepes-salgados', 'Crepe de Carne de Panela com Cheddar', 'Carne de panela desfiada, queijo, cheddar cremoso e orégano.', 34.90, '{"popular"}', true, 3, now()),
  ('crepe-carne-panela-doritos', 'crepes-salgados', 'Crepe de Carne de Panela com Doritos', 'Carne de panela desfiada, queijo, cobertura crocante de Doritos e orégano.', 34.90, '{"novo"}', true, 4, now()),
  ('crepe-chester', 'crepes-salgados', 'Crepe de Chester', 'Tomate fresco, queijo mussarela, requeijão, chester defumado e orégano.', 26.90, '{}', true, 5, now()),
  ('crepe-presunto', 'crepes-salgados', 'Crepe de Presunto', 'Tomate fresco, queijo mussarela, requeijão, presunto e orégano.', 26.90, '{}', true, 6, now()),
  ('crepe-frango-cremoso', 'crepes-salgados', 'Crepe de Frango Cremoso', 'Queijo mussarela, frango desfiado temperado, requeijão e orégano.', 28.90, '{"popular"}', true, 7, now()),

  -- ------------------------------------------------------------
  -- CREPES DOCES & PANQUECAS (Pág. 9, 16 e 17)
  -- ------------------------------------------------------------
  ('crepe-doce-confetes', 'crepes-doces', 'Crepe Doce Confetes', 'Base à sua escolha (chocolate ao leite ou branco) com cobertura de confetes.', 22.90, '{}', true, 1, now()),
  ('crepe-doce-amendoim', 'crepes-doces', 'Crepe Doce Amendoim', 'Base de chocolate ao leite ou branco com amendoim crocante.', 21.90, '{}', true, 2, now()),
  ('crepe-doce-ouro-branco', 'crepes-doces', 'Crepe Doce Ouro Branco', 'Base de chocolate ao leite ou branco com bombom Ouro Branco picado.', 22.90, '{"popular"}', true, 3, now()),
  ('crepe-doce-morango', 'crepes-doces', 'Crepe Doce Morango', 'Base à sua escolha (chocolate ao leite ou branco) com morangos frescos.', 23.90, '{"popular"}', true, 4, now()),
  ('crepe-doce-leite-banana', 'crepes-doces', 'Crepe Doce de Leite com Banana', 'Recheado com doce de leite cremoso e fatias de banana.', 21.90, '{}', true, 5, now()),
  ('crepe-meio-a-meio', 'crepes-doces', 'Crepe Meio a Meio', 'Escolha um sabor doce e outro sabor salgado para seu crepe.', 29.90, '{"popular"}', true, 6, now()),
  ('mini-crepe-frutas-vermelhas', 'crepes-doces', 'Mini Crepe Frutas Vermelhas com Sorvete', 'Chocolate branco, morango, amora, calda de frutas vermelhas e sorvete de creme.', 19.90, '{"popular"}', true, 7, now()),
  ('mini-crepe-crocante', 'crepes-doces', 'Mini Crepe Crocante com Sorvete', 'Chocolate ao leite, amendoim crocante e bola de sorvete de creme.', 19.90, '{}', true, 8, now()),
  ('mini-crepe-morango', 'crepes-doces', 'Mini Crepe Morango com Sorvete', 'Chocolate ao leite, morangos frescos fatiados e sorvete de creme.', 19.90, '{"popular"}', true, 9, now()),
  ('mini-crepe-confetes', 'crepes-doces', 'Mini Crepe Confetes com Sorvete', 'Confetes coloridos, chocolate ao leite e sorvete de creme.', 19.90, '{}', true, 10, now()),
  ('mini-crepe-doce-leite', 'crepes-doces', 'Mini Crepe Doce de Leite com Sorvete', 'Doce de leite, fatias de banana e bola de sorvete de creme.', 19.90, '{}', true, 11, now()),
  ('mini-panqueca-morango-granola', 'crepes-doces', 'Mini Panqueca Morango com Granola', 'Morangos frescos, granola crocante, mel e fatias de banana.', 19.90, '{}', true, 12, now()),
  ('mini-panqueca-kit-kat', 'crepes-doces', 'Mini Panqueca Kit Kat', 'Chocolate ao leite derretido coberto com pedaços de Kit Kat.', 19.90, '{"popular"}', true, 13, now()),
  ('mini-panqueca-chocolate-morango', 'crepes-doces', 'Mini Panqueca Chocolate com Morango', 'Chocolate ao leite cremoso com morangos frescos fatiados.', 19.90, '{"popular"}', true, 14, now()),
  ('mini-panqueca-doce-de-leite', 'crepes-doces', 'Mini Panqueca Doce de Leite com Banana', 'Doce de leite macio com fatias de banana fresca.', 19.90, '{}', true, 15, now()),

  -- ------------------------------------------------------------
  -- BAGUETES ARTESANAIS (Pág. 10 e 11)
  -- ------------------------------------------------------------
  ('baguete-frango', 'baguetes', 'Baguete de Frango', 'Requeijão, mussarela, frango desfiado, cebola roxa, tempero verde e azeite de oliva.', 28.90, '{"popular"}', true, 1, now()),
  ('baguete-vegetariano', 'baguetes', 'Baguete Vegetariano', 'Requeijão, mussarela, abobrinha grelhada, cebola roxa, tomate cereja, parmesão e azeite.', 25.90, '{}', true, 2, now()),
  ('baguete-chester', 'baguetes', 'Baguete de Chester', 'Requeijão, mussarela, chester defumado, cebola roxa e tempero verde.', 27.90, '{}', true, 3, now()),
  ('baguete-calabresa', 'baguetes', 'Baguete de Calabresa', 'Requeijão, mussarela, calabresa fatiada, cebola roxa e tempero verde.', 27.90, '{}', true, 4, now()),
  ('baguete-carne-panela', 'baguetes', 'Baguete de Carne de Panela', 'Requeijão, mussarela, carne de panela suculenta, cebola roxa, azeite e tempero verde.', 31.90, '{"popular"}', true, 5, now()),
  ('baguete-carne-italiano', 'baguetes', 'Baguete de Carne Italiano', 'Requeijão, mussarela, carne de panela, rúcula fresca, tomate cereja, azeite e tempero verde.', 31.90, '{"popular"}', true, 6, now()),

  -- ------------------------------------------------------------
  -- CROISSANTS (Pág. 14 e 19)
  -- ------------------------------------------------------------
  ('croissant-sanduiche', 'croissants', 'Croissant Sanduíche', 'Cream cheese, presunto nobre e queijo mussarela derretido.', 18.90, '{}', true, 1, now()),
  ('croissant-ovos-mexidos', 'croissants', 'Croissant Ovos Mexidos', 'Ovos mexidos cremosos, queijo mussarela, parmesão ralado e tempero verde.', 19.90, '{}', true, 2, now()),
  ('croissant-carne-panela', 'croissants', 'Croissant Carne de Panela', 'Requeijão, mussarela, carne de panela, parmesão, orégano e tomate cereja.', 26.90, '{"popular"}', true, 3, now()),
  ('croissant-frango-3-queijos', 'croissants', 'Croissant Frango aos 3 Queijos', 'Requeijão, mussarela, cream cheese, frango desfiado temperado e tomate cereja.', 24.90, '{"popular"}', true, 4, now()),
  ('croissant-tomate-seco', 'croissants', 'Croissant Tomate Seco', 'Requeijão, mussarela, tomate seco selecionado, rúcula fresca e parmesão.', 24.90, '{}', true, 5, now()),
  ('croissant-doce-sensacao', 'croissants', 'Croissant Doce Sensação', 'Chocolate ao leite com morangos frescos fatiados.', 22.90, '{"popular"}', true, 6, now()),
  ('croissant-doce-duetto', 'croissants', 'Croissant Doce Duetto', 'Chocolate ao leite, chocolate branco e morangos frescos.', 22.90, '{}', true, 7, now()),
  ('croissant-doce-chocolate-branco', 'croissants', 'Croissant Doce Chocolate Branco', 'Chocolate branco cremoso com morangos frescos.', 22.90, '{}', true, 8, now()),
  ('croissant-doce-de-leite', 'croissants', 'Croissant Doce de Leite', 'Doce de leite Uruguaio autêntico e fatias de banana fresca.', 22.90, '{}', true, 9, now()),
  ('croissant-doce-prestigio', 'croissants', 'Croissant Doce Prestígio', 'Chocolate ao leite com generoso recheio de coco tipo Prestígio.', 22.90, '{}', true, 10, now()),
  ('croissant-doce-ferrero', 'croissants', 'Croissant Doce Ferrero Rocher', 'Chocolate ao leite, bombom Ferrero Rocher e castanha triturada.', 24.90, '{"popular"}', true, 11, now()),
  ('croissant-doce-kinder-bueno', 'croissants', 'Croissant Doce Kinder Bueno', 'Chocolate ao leite, chocolate branco e pedaços de Kinder Bueno.', 24.90, '{"popular"}', true, 12, now()),

  -- ------------------------------------------------------------
  -- TORRADAS & LANCHES (Pág. 15)
  -- ------------------------------------------------------------
  ('torrada-simples', 'torradas-lanches', 'Torrada Simples', 'Queijo mussarela, requeijão cremoso, presunto e orégano no pão tostado.', 10.90, '{}', true, 1, now()),
  ('torrada-completa', 'torradas-lanches', 'Torrada Completa', 'Queijo, requeijão, presunto, ovo, tomate fatiado, alface crocante e orégano.', 15.90, '{"popular"}', true, 2, now()),
  ('torrada-salame-italiano', 'torradas-lanches', 'Torrada de Salame Italiano', 'Queijo, requeijão, salamito colonial fatiado, ovo, tomate, alface e orégano.', 17.90, '{"popular"}', true, 3, now()),
  ('sanduiche-frango-natural', 'torradas-lanches', 'Sanduíche Natural de Frango', 'Pão integral, alface, tomate, cebola roxa, cenoura ralada, requeijão, queijo e frango.', 17.90, '{}', true, 4, now()),
  ('ovos-mexidos-opcao-1', 'torradas-lanches', 'Ovos Mexidos - Opção 1', '4 ovos mexidos servidos com alface fresca, tomate cereja e molho rosé.', 19.90, '{}', true, 5, now()),
  ('ovos-mexidos-opcao-2', 'torradas-lanches', 'Ovos Mexidos - Opção 2', '4 ovos mexidos acompanhados de pão torrado quentinho, manteiga e geleia de uva.', 19.90, '{}', true, 6, now()),
  ('croque-madame', 'torradas-lanches', 'Croque Madame à Moda da Casa', 'Clássico francês em pão artesanal, presunto, queijo gratinado, bechamel, ovo e tempero.', 22.90, '{"popular"}', true, 7, now()),
  ('queijo-quente', 'torradas-lanches', 'Queijo Quente com Doce de Leite', 'Pão tostado com generosa porção de queijo derretido. Acompanha doce de leite.', 19.90, '{"popular"}', true, 8, now()),

  -- ------------------------------------------------------------
  -- SALADAS ESPECIAIS (Pág. 13)
  -- ------------------------------------------------------------
  ('mix-de-saladas', 'saladas', 'Mix de Saladas', 'Alface, rúcula, tomate cereja, ovo de codorna, croutons crocantes e molho rosé.', 23.90, '{}', true, 1, now()),
  ('salada-com-frango', 'saladas', 'Salada com Frango 120g', 'Alface, rúcula, tomate cereja, ovo de codorna, croutons, molho rosé e 120g de frango.', 31.90, '{"popular"}', true, 2, now()),
  ('salada-com-carne', 'saladas', 'Salada com Carne 120g', 'Alface, rúcula, tomate cereja, ovo de codorna, croutons, molho rosé e 120g de carne.', 34.90, '{}', true, 3, now()),
  ('salada-ceasar-da-casa', 'saladas', 'Salada Ceasar da Casa', 'Alface crocante, croutons, cenoura, molho Ceasar especial, parmesão e frango (120g).', 29.90, '{"popular"}', true, 4, now()),

  -- ------------------------------------------------------------
  -- TAÇAS ESPECIAIS & AÇAÍ (Pág. 20 e 21)
  -- ------------------------------------------------------------
  ('taca-especial-ferrero', 'tacas-acai', 'Taça Especial de Ferrero', 'Sorvete de chocolate, ganache de chocolate, castanha e bombom Ferrero Rocher.', 27.90, '{"popular"}', true, 1, now()),
  ('taca-especial-flocos', 'tacas-acai', 'Taça Especial Flocos', 'Sorvetes de flocos cremosos e ganache generosa de Nutella.', 24.90, '{}', true, 2, now()),
  ('taca-3-amores', 'tacas-acai', 'Taça 3 Amores', 'Sorvete de creme, morangos frescos fatiados e ganache de Nutella.', 24.90, '{"popular"}', true, 3, now()),
  ('floccotino', 'tacas-acai', 'Floccotino', 'Cappuccino gelado, sorvete de flocos cremoso e cobertura de chantilly.', 21.90, '{"popular"}', true, 4, now()),
  ('floccotino-borda-nutella', 'tacas-acai', 'Floccotino com Borda de Nutella', 'Cappuccino gelado, sorvete de flocos, borda farta de Nutella e chantilly.', 23.90, '{"popular"}', true, 5, now()),
  ('acai-taca-opcao-01', 'tacas-acai', 'Açaí na Taça 300ml - Opção 01', 'Açaí batido puro servido com granola, morangos e fatias de banana.', 21.90, '{}', true, 6, now()),
  ('acai-taca-opcao-02', 'tacas-acai', 'Açaí na Taça 300ml - Opção 02', 'Açaí batido na taça com leite Ninho em pó e morangos frescos.', 21.90, '{}', true, 7, now()),
  ('acai-taca-opcao-03', 'tacas-acai', 'Açaí na Taça 300ml - Opção 03', 'Açaí batido servido com Nutella e morangos frescos.', 24.90, '{"popular"}', true, 8, now()),
  ('acai-taca-opcao-04', 'tacas-acai', 'Açaí na Taça 300ml - Opção 04', 'Açaí cremoso na taça com doce de leite e morangos frescos.', 24.90, '{}', true, 9, now()),
  ('acai-taca-opcao-05', 'tacas-acai', 'Açaí na Taça 300ml - Opção 05', 'Açaí batido servido com leite Ninho em pó e Nutella.', 24.90, '{"popular"}', true, 10, now()),
  ('salada-frutas-simples', 'tacas-acai', 'Salada de Frutas', 'Mix refrescante de frutas frescas selecionadas da estação.', 13.90, '{}', true, 11, now()),
  ('salada-frutas-com-sorvete', 'tacas-acai', 'Salada de Frutas com Sorvete', 'Mix de frutas da estação servido com bola de sorvete de creme.', 16.90, '{"popular"}', true, 12, now()),
  ('panelinha-de-frutas', 'tacas-acai', 'Panelinha de Frutas', 'Mix de frutas da estação servido com iogurte grego cremoso e granola.', 17.90, '{}', true, 13, now()),

  -- ------------------------------------------------------------
  -- BALCÃO & CONFEITARIA (Pág. 22)
  -- ------------------------------------------------------------
  ('bolo-da-india', 'balcao', 'Bolo da Índia', 'Fatia do tradicional e perfumado bolo da Índia. Consulte sabores do dia.', 14.90, '{}', true, 1, now()),
  ('mini-tortas-vitrine', 'balcao', 'Mini Tortas Finas', 'Mini tortas artesanais individuais. Consulte os sabores disponíveis na vitrine.', 18.90, '{"popular"}', true, 2, now()),
  ('pastel-forno-carne-cheddar', 'balcao', 'Pastel de Forno Carne com Cheddar', 'Pastel assado no forno recheado com carne e queijo cheddar.', 12.90, '{}', true, 3, now()),
  ('pastel-forno-frango-catupiry', 'balcao', 'Pastel de Forno Frango com Catupiry', 'Pastel assado no forno com frango desfiado e catupiry cremoso.', 12.90, '{}', true, 4, now()),
  ('pao-de-calabresa', 'balcao', 'Pão de Calabresa', 'Pão artesanal recheado com calabresa e queijo.', 11.90, '{}', true, 5, now()),
  ('pao-de-queijo', 'balcao', 'Pão de Queijo Tradicional', 'Pão de queijo mineiro assado quentinho na hora.', 6.50, '{"popular"}', true, 6, now()),
  ('pao-a-portuguesa', 'balcao', 'Pão à Portuguesa', 'Pão recheado especial à moda portuguesa.', 11.90, '{}', true, 7, now()),
  ('pao-de-frango', 'balcao', 'Pão de Frango', 'Pão artesanal fofinho recheado com frango cremoso.', 11.90, '{}', true, 8, now()),
  ('torta-frango-cremosa', 'balcao', 'Torta de Frango Cremosa (Fatia)', 'Fatia de torta salgada artesanal com recheio cremoso de frango.', 16.90, '{"popular"}', true, 9, now()),
  ('torta-de-legumes', 'balcao', 'Torta de Legumes (Fatia)', 'Fatia de torta salgada vegetariana de legumes frescos.', 15.90, '{}', true, 10, now()),
  ('tortas-doces-fatia', 'balcao', 'Tortas Doces Tradicionais (Fatia)', 'Fatia de torta doce artesanal. Consulte sabores disponíveis na vitrine.', 18.90, '{"popular"}', true, 11, now()),

  -- ------------------------------------------------------------
  -- SUCOS NATURAIS & VITAMINAS (Pág. 24)
  -- ------------------------------------------------------------
  ('suco-laranja', 'sucos-vitaminas', 'Suco Natural de Laranja 400ml', 'Suco natural feito na hora, sem adição de açúcar.', 11.90, '{"popular"}', true, 1, now()),
  ('suco-abacaxi', 'sucos-vitaminas', 'Suco Natural de Abacaxi 400ml', 'Suco natural feito na hora, sem adição de açúcar.', 11.90, '{}', true, 2, now()),
  ('suco-mamao', 'sucos-vitaminas', 'Suco Natural de Mamão 400ml', 'Suco natural feito na hora, sem adição de açúcar.', 11.90, '{}', true, 3, now()),
  ('suco-morango', 'sucos-vitaminas', 'Suco Natural de Morango 400ml', 'Suco da fruta de morango 400ml sem adição de açúcar.', 13.90, '{"popular"}', true, 4, now()),
  ('suco-verde', 'sucos-vitaminas', 'Suco Natural Verde 400ml', 'Laranja, abacaxi e folha fresca de couve batidos na hora.', 13.90, '{"popular"}', true, 5, now()),
  ('suco-laranja-mamao', 'sucos-vitaminas', 'Suco Natural Laranja com Mamão 400ml', 'Combinação natural de laranja com mamão sem açúcar.', 13.90, '{}', true, 6, now()),
  ('suco-laranja-morango', 'sucos-vitaminas', 'Suco Natural Laranja com Morango 400ml', 'Combinação refrescante de laranja com morangos frescos.', 13.90, '{}', true, 7, now()),
  ('vitamina-banana', 'sucos-vitaminas', 'Vitamina de Banana 400ml', 'Vitamina cremosa de leite com banana fresca.', 10.90, '{}', true, 8, now()),
  ('vitamina-morango', 'sucos-vitaminas', 'Vitamina de Morango 400ml', 'Vitamina cremosa de leite com morangos selecionados.', 10.90, '{}', true, 9, now()),

  -- ------------------------------------------------------------
  -- BEBIDAS COM ÁLCOOL (Pág. 25)
  -- ------------------------------------------------------------
  ('espumante-750ml', 'bebidas-alcoolicas', 'Espumante 750ml (Brut ou Moscatel)', 'Garrafa 750ml Salton Brut ou Moscatel. Promoção 50% OFF na 2ª unidade.', 75.00, '{}', true, 1, now()),
  ('taca-espumante-170ml', 'bebidas-alcoolicas', 'Taça de Espumante 170ml', 'Taça de espumante refrescante. Promoção 50% OFF na 2ª unidade.', 16.90, '{}', true, 2, now()),
  ('drink-mimosa', 'bebidas-alcoolicas', 'Drink Mimosa 170ml', 'Clássico espumante Brut com suco de laranja natural. 50% OFF na 2ª unidade.', 16.90, '{"popular"}', true, 3, now()),
  ('aperol-spritz', 'bebidas-alcoolicas', 'Aperol Spritz 400ml', 'Água com gás, Espumante Brut e dose generosa de Aperol. 50% OFF na 2ª unidade.', 27.90, '{"popular"}', true, 4, now()),
  ('dose-whisky-jameson', 'bebidas-alcoolicas', 'Dose de Whisky Jameson', 'Dose de whisky irlandês Jameson original.', 21.90, '{}', true, 5, now()),
  ('cerveja-tradicional', 'bebidas-alcoolicas', 'Cerveja Long Neck (Consulte opções)', 'Cervejas long neck disponíveis no balcão.', 15.00, '{}', true, 6, now()),
  ('cerveja-zero-alcool', 'bebidas-alcoolicas', 'Cerveja Long Neck 0.0% Álcool', 'Cerveja long neck sem álcool.', 15.00, '{}', true, 7, now()),
  ('gin-tonica-frutas-vermelhas', 'bebidas-alcoolicas', 'Gin Tônica de Frutas Vermelhas', 'Gin premium, água tônica e infusão de frutas vermelhas.', 23.90, '{"popular"}', true, 8, now()),
  ('gin-tonica-blueberry', 'bebidas-alcoolicas', 'Gin Tônica de Blueberry', 'Gin premium, água tônica e mirtilos (blueberry).', 23.90, '{}', true, 9, now()),

  -- ------------------------------------------------------------
  -- SEM LACTOSE & SEM GLÚTEN (Pág. 27)
  -- ------------------------------------------------------------
  ('panqueca-sem-lactose-granola', 'sem-lactose-gluten', 'Mini Panqueca de Granola e Mel (Sem Lactose)', 'Mini panqueca sem lactose, mel, banana, morango e granola.', 19.90, '{}', true, 1, now()),
  ('panqueca-sem-lactose-morango', 'sem-lactose-gluten', 'Mini Panqueca Americana de Morango (Sem Lactose)', 'Mini panquecas, chocolate 0% lactose e morangos frescos.', 21.90, '{}', true, 2, now()),
  ('mini-crepe-sem-lactose-crocante', 'sem-lactose-gluten', 'Mini Crepe Crocante com Sorvete (Sem Lactose)', 'Massa sem lactose, chocolate 0% lactose, sorvete 0% lactose e amendoim.', 21.90, '{}', true, 3, now()),
  ('mini-crepe-sem-lactose-morango', 'sem-lactose-gluten', 'Mini Crepe Morango com Sorvete (Sem Lactose)', 'Massa sem lactose, chocolate 0% lactose, sorvete 0% lactose e morango.', 21.90, '{}', true, 4, now()),
  ('crepe-sem-lactose-crocante', 'sem-lactose-gluten', 'Crepe Crocante (Sem Lactose)', 'Crepe de chocolate 0% lactose e amendoim.', 21.90, '{}', true, 5, now()),
  ('crepe-sem-lactose-morango', 'sem-lactose-gluten', 'Crepe Chocolate e Morango (Sem Lactose)', 'Crepe com chocolate 0% lactose e morangos frescos.', 23.90, '{}', true, 6, now()),
  ('torta-soft-gateau-sem-lactose', 'sem-lactose-gluten', 'Torta Soft Gateau (Sem Lactose)', 'Gateau de chocolate e mousse de chocolate 0% lactose.', 16.90, '{"popular"}', true, 7, now()),
  ('torrada-simples-sem-lactose', 'sem-lactose-gluten', 'Torrada Simples (Sem Lactose)', 'Pão 0% lactose, presunto e queijo 0% lactose.', 12.90, '{}', true, 8, now()),
  ('torrada-completa-sem-lactose', 'sem-lactose-gluten', 'Torrada Completa (Sem Lactose)', 'Pão 0% lactose, presunto, queijo 0% lactose, alface, tomate e ovo.', 17.90, '{}', true, 9, now()),
  ('calzone-frango-sem-gluten', 'sem-lactose-gluten', 'Calzone de Frango (Sem Glúten)', 'Calzone sem glúten recheado com frango. Atenção: pode conter traços/resquícios.', 14.90, '{}', true, 10, now()),
  ('calzone-marguerita-sem-gluten', 'sem-lactose-gluten', 'Calzone Marguerita Vegetariano (Sem Glúten)', 'Calzone sem glúten de queijo, tomate e manjericão. Pode conter resquícios.', 14.90, '{}', true, 11, now()),
  ('acai-tigela-sem-gluten', 'sem-lactose-gluten', 'Açaí na Tigela (Sem Glúten)', 'Açaí servido na tigela com banana, morango e granola sem glúten.', 19.50, '{}', true, 12, now()),
  ('milkshake-sem-gluten', 'sem-lactose-gluten', 'Milkshake de Chocolate (Sem Glúten)', 'Milkshake cremoso de chocolate preparado sem glúten.', 22.90, '{}', true, 13, now()),
  ('cheiro-verde-calzone-frango', 'sem-lactose-gluten', 'Calzone de Frango Cheiro Verde (Celíacos - 0% Glúten e Leite)', 'Produzido em cozinha estéril, livre de glúten e leite. Servido lacrado.', 14.90, '{"popular"}', true, 14, now()),
  ('cheiro-verde-calzone-marguerita', 'sem-lactose-gluten', 'Calzone Marguerita Cheiro Verde (Celíacos - 0% Glúten e Leite)', 'Produzido em cozinha estéril, livre de glúten e leite. Servido lacrado.', 14.90, '{}', true, 15, now()),
  ('cheiro-verde-crepioca-frango', 'sem-lactose-gluten', 'Panqueca de Crepioca c/ Frango Cheiro Verde (3 un/300g)', '3 unidades (300g). Cozinha estéril, segura para celíacos. Servido lacrado.', 25.90, '{}', true, 16, now()),
  ('cheiro-verde-brigadeiro', 'sem-lactose-gluten', 'Brigadeiro Funcional Cheiro Verde (Celíacos)', 'Brigadeiro funcional seguro para celíacos e intolerantes a lactose.', 3.50, '{}', true, 17, now())
ON CONFLICT (id) DO UPDATE SET
  categoria_id = EXCLUDED.categoria_id,
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  preco = EXCLUDED.preco,
  badges = EXCLUDED.badges,
  ativo = EXCLUDED.ativo,
  ordem = EXCLUDED.ordem,
  updated_at = now();
