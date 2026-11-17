# HeroGlobe

HeroGlobe is the opening-screen image: a wireframe globe on Night, turning slowly, with payment arcs in soft patina (`brand-signal`) between real cities and their rails.

**Use:** the marketing hero (right six columns, bleeding off the edge), the sign-up background (small, at 30% opacity), and the pitch title slide. It is the page's one moving thing.

**Provide:** a list of cities (latitude, longitude, name, rail) and the arcs between them. Start arcs from the customer's home city when it's known. The demo set is São Paulo (Pix), New York (ACH), Mexico City (SPEI), Lisbon (SEPA), Bangkok (PromptPay) and Jakarta (QRIS).

**Rules:** about 7° of rotation a second with an 18° tilt; graticule lines every 15°; one pulse travels each arc. Labels in `data` style, the city in near-white and the rail in `brand-signal`. Under reduced motion, draw one still frame. Only ever on Night grounds.

**Don't:** add photo-textured continents, flags, coin icons or more than eight cities; speed it up; put text over the sphere.

**Example:** [HeroGlobe.html](HeroGlobe.html) (the opening-screen globe: rotating wireframe with payment arcs).
