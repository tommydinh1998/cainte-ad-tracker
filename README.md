# Cainte Ad Tracker

## KPI-rapportering

Femte produkt i Ops-appen. Lag A = maskintal, lag B = ét tal pr. ansvarlig
indsendt på `/r/<token>` inden fredag kl. 12. Tabeller: `kpi_*`, selv-oprettet
og seedet ved boot.

Miljøvariabler (alle valgfrie — uden dem kører appen bare uden den funktion):

| Variabel | Bruges til |
| --- | --- |
| `SLACK_WEBHOOK_URL` | Fredag 09:00-påmindelse og mandag 07:00-besked |
| `PUBLIC_URL` | Basen i de personlige links (default `https://ops.cainte.com`) |
| `KPI_INGEST_KEY` | Kræves som `x-api-key` på `POST /api/kpi/ingest` når den er sat |

Rapport-pipelinen skriver lag A ind med
`POST /api/kpi/ingest` `{ "period": "2026-W36", "values": { "mer_all_channel": 2.1 } }`
og henter hele ugen med `GET /api/kpi/report/2026-W36`.
