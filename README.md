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

## Team Tasks

Sixth product (ported from Sapphire Ops on 2026-09-23). One todo list per
department (Content, Email, Influencer / Social media, Paid ads; seeded per
brand, editable via "+ Department" / "Edit department"), a left column with
every open deadline grouped by urgency and the next 14 days of meetings, a
"Who" filter remembered per browser, a month calendar for one-off / weekly /
biweekly / monthly meetings and reminders, file attachments shared across
tasks, and a link to Collection Tracker collections: a task can carry
`collection_id`, the Collection Tracker's "Team Tasks" tab shows those rows
grouped by department with a progress bar, and `ct_tasks` is retired (rows
migrate into `tk_tasks` on boot). Tables `tk_departments`, `tk_tasks`,
`tk_events`, `tk_files`, `tk_task_files`; routes under `/api/tk/*`. All
brand-scoped via the `X-Brand` header.
