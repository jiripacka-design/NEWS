# Starter data

Researched 27-28 Oct 2026 from the public pages linked in each row. Every product row has its own `sourceUrl` and `lastVerified` date.

- **`public/starter-data/products.json`**: 13 models. Loaded by **Product matrix > Load researched data** (existing models with the same brand + model are updated, nothing is deleted). `products.csv` is the same data for spreadsheets or **Import CSV**.
- **`brand-data.json`**: company facts and, where found, volumes, SKUs and P&A for Brompton, Tern, Dahon, Ahooga, Gocycle and Birdy. **Load researched data** imports both files; you can also use **Competitors > Import brand data**.

## Confidence
- **Official brand page, full spec:** Brompton C Line 12-speed MY27 (the page you linked), Tern Verge X11, Brompton Electric C Line (spec from brompton.com; weight and price from a UK retailer).
- **Brand page plus press or retailer:** Dahon Mariner D8, Ahooga A-MAX / E-MAX, Gocycle G4, Brompton P Line MK2.
- **Carried over, not rechecked:** Brompton A, G and T Line and Electric T Line use UK retailer "from" prices and weights from the earlier starter file.

## Known gaps
- No GBP price for Dahon and Ahooga (EUR/USD noted in the price note). Gocycle's price is from the G4 launch article.
- Competitor sites publish far fewer component details than Brompton does, so most competitor rows are 25-80% filled.
- Folded sizes on several competitor pages have no axis labels; the assignment to H/W/D is noted on those rows. Volume is unaffected.
- Birdy: Wikipedia says Riese & Müller stopped selling it in 2025. Check before treating it as active.
- Not researched: the other 31 brands (UTO, Pacific Cycles, Strida, Bickerton, Bike Friday, Montague, Engwe, Lectric, Fiido and so on).

## Volumes, SKUs and P&A (added 28 Oct)
- **Brompton:** P&A 345 is a proxy: one UK dealer stocks about 345 items in its Brompton components, spares and bags range (some third-party). Units and revenue come from the earlier curated figures.
- **Dahon:** 1,000,000 units and 300+ models are Dahon's own claims (all bike types, capacity-style), flagged low confidence.
- **Tern:** 10 bike lines, 65 countries, accessories under sister brand BioLogic. No unit figure is published.
- **Gocycle:** 3 models (G4, G4i, G4i+). Ahooga: 4 models. No P&A counts found for these.
- Still empty for most of the other 32 brands. Use **Export brand data**, fill in what you know, then import.
