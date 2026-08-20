# Opportunity OS — audit handover

Datum provjere: 20. kolovoza 2026.
Radno okruženje: lokalni Windows workspace, Next.js i lokalni Supabase.
Svrha: precizan nastavak rada bez ponovnog audita već dokazanih dijelova i bez preuveličavanja integracija.

## Executive summary

Sustav je lokalno operativan i health endpoint vraća `HEALTHY`. Osnovni repository, CI, hunter, privatni podatkovni sloj, master CV grounding i početni application batch preview postoje.

Automatsko slanje prijava **nije implementirano niti uključeno**. Trenutno postoji pregled batcha do 20 stavki, pojedinačni/select-all approval UI i zaključani send gumb. Recipient-level Gmail deduplikacija, trajni approval zapisi, finalni PDF privici i idempotentno Gmail slanje ostaju obavezni prije prvog batcha.

## Dokazano lokalno stanje

| Površina           | Stanje                     | Dokaz                                                                    |
| ------------------ | -------------------------- | ------------------------------------------------------------------------ |
| Next.js DEV        | RUNNING                    | `http://127.0.0.1:3000`                                                  |
| Health             | PASS                       | aplikacija `HEALTHY`, baza `CONNECTED`                                   |
| Lokalni Supabase   | RUNNING                    | API, Postgres, Studio i Storage dostupni lokalno                         |
| Izvori             | PARTIAL                    | 11 registriranih, 9 enabled i 9 LIVE                                     |
| Oglasi             | PASS za aktivne ATS izvore | 303 oglasa iz 9 verificiranih službenih ATS feedova                      |
| Gmail snapshot     | PARTIAL                    | 25 lokalno spremljenih outbound poruka; nije kontinuirani OAuth sync     |
| Engleski master CV | PASS                       | 1 `APPROVED MASTER_EN`, šifrirani payload, 18 verificiranih EN činjenica |
| Hrvatski master CV | PASS                       | 1 `APPROVED MASTER_HR`, 18 verificiranih HR činjenica                    |
| Testovi            | PASS                       | 33 testne datoteke, 149 testova                                          |
| Data integrity     | PASS                       | 21 provjera, 0 nalaza, `LOCAL_DATA_INTEGRITY_PASS`                       |
| Lint/typecheck     | PASS                       | zadnja lokalna provjera                                                  |
| Batch preview      | PASS kao lokalni preview   | ruta `/application-batches` vraća HTTP 200                               |
| CV Agent V2        | PASS                       | requirement matrix, evidence scoring, hard-gap gate i immutable override |
| Slanje prijava     | BLOCKED                    | nema recipient-level dokaza, trajnog approvala ni send audit traila      |

## CV Agent V2 — dovršeno u ovom handoveru

- Oglas se prije izrade CV-a rastavlja na eksplicitne zahtjeve i prioritete `HARD_MUST`, `MUST` i `NICE`.
- Svaki zahtjev ima vezane fact ID-eve, dokaznu snagu E0–E5, status podudaranja i blocker oznaku.
- CV evidence score i opportunity score računaju se iz iste matrice; `BLOCKED_HARD_GAP` nikad ne može imati opportunity score 50 ili više.
- Oglas s neriješenim hard-gapom ne može u CV generation ni application batch bez overridea vezanog uz točan SHA-256 analize.
- Override je append-only zapis s korisnikom, razlogom i potvrđenim gapovima; RLS ograničava vlasništvo, a trigger odbija update i delete.
- Tailoring bira samo relevantne verificirane fact ID-eve i odbija fact-store/audit metajezik u tekstu koji vidi kandidat.
- Janea Systems testni oglas vraća `BLOCKED_HARD_GAP` zbog nedokazanih obveznih uvjeta, uključujući 10+ godina, produkcijski AI/ML i upravljanje timom.

## Stvarno povezani servisi

- Lokalni Supabase/Postgres i privatna shema.
- Gmail agent connector za autorizirano čitanje i eksplicitne Gmail radnje.
- Greenhouse Job Board API za Mesh, Sporty Group i Janea Systems.
- Lever Postings API za Fliff i Yuno.
- Ashby službeni Job Postings API za Ashby i Linear.
- SmartRecruiters javni Posting API za Sportradar i Visu.
- OpenAI provider postoji u kodu i radi samo uz valjanu server-side konfiguraciju.

EURES, LinkedIn/commercial boards, USAJOBS, Job Bank Canada, Workforce Australia i jobs.govt.nz nisu runtime integracije. Oni su research/disconnected zapisi i trenutno ne donose oglase.

## CV truth contract

Svaki engleski prilagođeni CV mora:

1. koristiti samo verificirane činjenice povezane s `APPROVED MASTER_EN`;
2. potvrditi isti `source_cv_version_id` i `source_hash` za sve korištene činjenice;
3. dopustiti oglasu samo promjenu naglaska, redoslijeda, naslova i ekstraktivnog sažetka;
4. odbiti novu tehnologiju, brojku, iskustvo, poslodavca, credential ili rezultat bez izvornog fact ID-a;
5. ostati `DRAFT` dok ga korisnik ne pregleda i odobri.

Postojeći AI grounding kod već provjerava odobreni lifecycle, hash konzistenciju, fact ID-eve i nepodržane tokene/tvrdnje.

## Targeting contract

Application kandidat prolazi samo kada oglas eksplicitno dokazuje:

- remote rad;
- B2B, contract, contractor, freelance, fractional ili consulting angažman;
- remote B2B, contract, consulting ili freelance signal; navedeni sati služe za pregovor i nisu automatska blokada;
- živ i trenutno verificiran oglas;
- `ELIGIBLE` ili `LIKELY_ELIGIBLE` status za Hrvatsku/EU.

US vremenska zona, fleksibilni US sati ili asynchronous rad označavaju dobar signal za rad nakon 16:00 Europe/Zagreb. Ako tjedni sati nisu eksplicitni, kandidat ostaje blokiran umjesto da se pretpostavi part-time opseg.

## Conversation contract

Prijedlozi poruka koriste etičke principe iz:

- Never Split the Difference;
- Influence;
- Getting to Yes;
- How to Win Friends and Influence People;
- Made to Stick;
- Founding Sales;
- The Mom Test;
- Obviously Awesome;
- The Trusted Advisor.

Praktična pravila: jedna konkretna relevantna vrijednost, jedno niskotlačno kalibrirano pitanje, fokus na problem i uvjete klijenta, bez lažne hitnosti, izmišljene nestašice, lažnog autoriteta, social proofa ili tvrdnji bez CV izvora.

## Batch UI koji je sada implementiran

Ruta: `http://127.0.0.1:3000/application-batches`

- paginacija po najviše 20 kandidata;
- preview izvornog oglasa;
- deterministički preview poruke i prikaz korištenog book frameworka;
- link na source-linked CV Studio preview;
- pojedinačni checkbox;
- `Select all eligible in this batch` checkbox;
- blokada već kontaktirane firme prema lokalnom Gmail snapshotu;
- zaključani `Send approved batch` gumb.

Select-all namjerno preskače blokirane i prethodno kontaktirane stavke.

## Kritični otvoreni rizici

### P0 — prije bilo kakvog slanja

1. Lokalni Gmail snapshot nije kontinuirano sinkroniziran s Gmailom. Deduplikacija mora neposredno prije slanja provjeriti stvarni `SENT` mailbox.
2. Firma-level dedupe nije dovoljna. Potrebni su recipient address, recipient domain, Gmail thread, canonical job key i application key.
3. Job feed uglavnom daje application URL, ne provjerenu kontaktnu e-mail adresu.
4. Approval checkboxi su client-side stanje i nestaju nakon refreshanja; moraju se trajno i auditirano spremiti.
5. Prilagođeni CV preview još nije finalni, odobreni PDF attachment za svaki application package.
6. Send mora imati idempotency key i transakcijski zapis `planned → approved → sending → sent/failed`.
7. Pravi Supabase Auth nije implementiran; produkcijsko slanje mora ostati blokirano do CP03.

### P1 — coverage i kvaliteta

1. Implementirati dodatne službene/ovlaštene izvore; ne scrapingati portale protiv uvjeta korištenja.
2. Prikazati funnel po izvoru: fetched → live → remote → ≤20 h → eligible → recipient verified → previewed → approved → sent.
3. Popraviti fairness/limit upita tako da veliki board ne istisne manje izvore prije filtriranja.
4. Dodati precizniji timezone overlap i raspoloživost nakon 16:00.

## Preporučeni nastavak rada

1. Napraviti Supabase migraciju za `application_packages`, `application_batch_items` i immutable delivery attempts s ownership RLS pravilima.
2. Dodati server-side Gmail reconciliation servis koji neposredno prije previewa i slanja vraća dedupe dokaz bez spremanja javnog body sadržaja.
3. Implementirati recipient verification i blokirati generičke/neprovjerene adrese.
4. Persistirati pojedinačni approval za oglas, poruku i CV hash.
5. Generirati i spremiti šifrirani finalni CV PDF po paketu.
6. Uvesti dry-run audit endpoint; rezultat mora imati 0 P0 nalaza prije otključavanja send gumba.
7. Implementirati Gmail batch send s maksimalno 20 stavki, idempotencijom, zaustavljanjem na grešci i audit trailom.
8. Prvi pravi batch izvršiti tek nakon korisničkog pregleda svih finalnih recipienta, poruka, oglasa i CV datoteka.

## Verifikacijske naredbe

```powershell
npm run dev:status
npm run infra:status
npm run lint
npm run format:check
npm test
npm run typecheck
npm run build
```

Za bazni security/integrity gate, bez resetiranja privatne baze:

```powershell
npm run test:db
npm run audit
```

Ne pokretati `infra:reset` nad trenutnom privatnom lokalnom bazom.

## Git handover

- Branch: `main`, prati `origin/main`.
- Zadnji objavljeni GitHub commit: `164c64c`.
- Zadnji objavljeni CI za taj commit: PASS.
- Batch preview, targeting, outreach policy i ovaj handover trenutačno su lokalne necommitane promjene.
- Prije commita ponovno pregledati staged scope i privacy scan; privatni Gmail audit dokumenti, `.env.local`, lokalni Supabase state i privatni CV payloadi moraju ostati ignorirani.

## Adrese

- Lokalna aplikacija: <http://127.0.0.1:3000>
- Batch preview: <http://127.0.0.1:3000/application-batches>
- GitHub: <https://github.com/ICiri/opportunity-os>
