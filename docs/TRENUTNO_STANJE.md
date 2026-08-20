# Opportunity OS — trenutno stanje

Provjereno lokalno: 20. kolovoza 2026.

## Kratki odgovor

Aplikacija nije spojena na cijelo tržište poslova. Trenutno stvarno dohvaća oglase samo s odabranih Greenhouse i Lever company boardova.

Lokalna baza sadrži **167 živih oglasa iz 5 firmi**:

| Aktivni izvor | Adapter    | Živi oglasi | Eligible / likely eligible |
| ------------- | ---------- | ----------: | -------------------------: |
| Sporty Group  | Greenhouse |          59 |                         25 |
| Yuno          | Lever      |          42 |                         17 |
| Fliff         | Lever      |          31 |                          7 |
| Mesh          | Greenhouse |          24 |                          8 |
| Janea Systems | Greenhouse |          11 |                          7 |

Ove brojke znače da je oglas spremljen i da je zadnja provjera izvora vratila HTTP 200. Ne znače da su svi oglasi prikladni za korisnika niti da firma prihvaća rad iz Hrvatske.

## Zašto UI može prikazati samo dvije firme

Trenutni loader u `loadPersistedHunterJobs()` prvo učita najviše 100 najnovije verificiranih oglasa, a tek zatim UI zadržava oglase koji su:

1. još uvijek živi;
2. `ELIGIBLE` ili `LIKELY_ELIGIBLE`;
3. eksplicitno označeni kao remote u tekstu oglasa.

Budući da Sporty Group i Yuno zajedno imaju 101 živi oglas, limit prije filtriranja može izgurati oglase drugih firmi iz rezultata. To je poznati problem upita/prikaza, a ne dokaz da baza sadrži samo dvije firme.

Potrebni popravak: filtriranje i pravednija raspodjela po izvorima moraju se dogoditi u SQL upitu prije limita, ili loader mora dohvatiti dovoljno kandidata pa tek onda primijeniti konačni limit.

## Stvarno implementirano

- lokalni Next.js UI i kontrolirano pokretanje servera;
- lokalni Supabase/Postgres s migracijama, RLS pravilima i privatnom shemom;
- Greenhouse Job Board API adapter;
- Lever Postings API adapter;
- normalizacija, deduplikacija, freshness i konzervativna procjena dostupnosti za Hrvatsku/EU;
- trajno spremanje runova, ishoda po izvoru, sirovog ingest zapisa, oglasa i snapshotova;
- Opportunities, Hunter, CV Studio, Conversations, Relationships, Planning i Analytics prikazi;
- mock email i AI provideri te stvarni OpenAI provider koji ostaje isključen bez server-side konfiguracije;
- 129 unit testova, lint, format, typecheck, build i GitHub Actions CI;
- javni GitHub repozitorij s MIT licencom.

## Registrirano, ali nije spojeno

Sljedeći izvori postoje samo kao research/disconnected zapisi. Nemaju aktivan runtime adapter i trenutno ne donose oglase:

- EURES i nacionalni EU/EEA servisi;
- LinkedIn i drugi komercijalni job boardovi;
- USAJOBS;
- Job Bank Canada;
- Workforce Australia;
- jobs.govt.nz.

Ne smije se tvrditi da Opportunity OS trenutno pretražuje ove izvore.

## Ostala važna ograničenja

- Supabase Auth još nije implementiran; lokalni razvoj koristi fiksni lokalni user ID.
- Gmail nema ponovljiv OAuth/incremental import proces.
- Nema automatskog slanja e-mailova; odobrenje i slanje ostaju odvojene ljudske odluke.
- Bounty discovery/testing adapteri nisu implementirani.
- Cloudflare scheduler je projektiran, ali nije produkcijski deployan.
- CP02 još čeka potpuno čisti disposable bootstrap dokaz prije formalnog zatvaranja.

## Ugovor za CV i razgovore

- Svaki engleski prilagođeni CV koristi samo verificirane činjenice iz odobrenog `MASTER_EN` dokumenta s odgovarajućim hashom.
- Oglas smije promijeniti naglasak i redoslijed, ali ne smije stvoriti novu vještinu, iskustvo, brojku, poslodavca ili rezultat.
- Prijedlozi poruka koriste etičke principe iz navedenih knjiga: Voss, Cialdini, Getting to Yes, Carnegie, Made to Stick, Founding Sales, The Mom Test, Obviously Awesome i The Trusted Advisor.
- Zabranjeni su izmišljena hitnost, lažni autoritet/social proof, pritisak i tvrdnje bez izvora.
- Svaki prijedlog ostaje pojedinačno pregledan i odobren prije uključivanja u batch.

## Preporučeni sljedeći redoslijed

1. Popraviti SQL/UI limit kako bi svih 5 aktivnih firmi bilo pošteno zastupljeno.
2. Prikazati brojače `dohvaćeno → remote → eligible → prikazano` po izvoru.
3. Dodati konfigurabilne Greenhouse/Lever boardove bez promjene koda.
4. Implementirati i verificirati dodatne službene izvore, počevši s EURES-om ako uvjeti pristupa dopuštaju automatizaciju.
5. Implementirati pravi Supabase Auth prije ikakvog javnog hostinga.

## Brze adrese

- Lokalna aplikacija: <http://127.0.0.1:3000>
- GitHub: <https://github.com/ICiri/opportunity-os>
