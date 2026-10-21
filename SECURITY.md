## Käynnistys

Aseta satunnainen vähintään 32 merkin `TINYJIRA_TOKEN` ja käynnistä
`node server.js`. Selain kysyy HTTP Basic -käyttäjäksi `admin` ja salasanaksi
tokenia. API-asiakas voi käyttää Bearer-otsaketta. Puuttuva asetus estää
käynnistymisen. Oletusosoite on `127.0.0.1:3000`.

Etäkäyttöön käytä SSH-tunnelia tai TLS-välitystä. `TINYJIRA_HOST` valitsee
kuunteluosoitteen ja `TINYJIRA_ALLOWED_HOSTS` pilkuilla erotetut sallitut
palvelinnimet (ei porttia). TLS-välityksessä aseta lisäksi `TINYJIRA_ORIGIN`
täsmälliseksi selaimen originiksi, esimerkiksi `https://board.example.com`,
ja säilytä Host-otsake. HTTP Basic ei itsessään salaa tokenia verkossa.

PUT-pyyntö on enintään 1 MiB. Palvelin ei hyväksy prototype-avaimia tai
ristiin tehtyjä selainpyyntöjä. CSV:n ja asetusten arvot escapetaan myös
HTML-attribuutteja varten. Testit: `node --test tests/security.test.cjs`.
Ne käyttävät väliaikaista datakansiota eivätkä käynnistä verkkopalvelinta.

Node-versio on `.nvmrc`:ssä. Sovelluksessa ei ole npm-riippuvuuksia.
