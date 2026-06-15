const axios = require('axios');
const cheerio = require('cheerio');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.presskurier.de';
const THEME_URL = `${BASE_URL}/thema/mecklenburgische-baderbahn`;
const YAML_PATH = path.join(__dirname, 'index.yaml');

async function scrapeFotos() {
    console.log(`Lese aktuelle Fotos aus: ${YAML_PATH}`);
    let existingData = [];
    if (fs.existsSync(YAML_PATH)) {
        const fileContents = fs.readFileSync(YAML_PATH, 'utf8');
        existingData = yaml.load(fileContents) || [];
    }
    
    // Create a Set of existing article URLs to avoid duplicates
    const existingUrls = new Set(existingData.map(item => item.artikel || item.url_artikel));

    console.log(`Lade Übersichtsseite: ${THEME_URL}`);
    let html;
    try {
        const response = await axios.get(THEME_URL);
        html = response.data;
    } catch (e) {
        console.error("Fehler beim Laden der Übersichtsseite:", e.message);
        return;
    }

    const $ = cheerio.load(html);
    const articleLinks = new Set();
    
    // Finde alle Links, die nach Artikeln aussehen (z.B. /192/molli-...)
    $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.match(/^\/\d+\/[a-z0-9-]+$/)) {
            articleLinks.add(BASE_URL + href);
        } else if (href && href.startsWith('https://www.presskurier.de/') && href.match(/presskurier\.de\/\d+\/[a-z0-9-]+$/)) {
            articleLinks.add(href);
        }
    });

    console.log(`${articleLinks.size} Artikel-Links gefunden.`);
    
    // Wenn es noch index_raw Daten gibt, die noch nicht im YAML sind, fügen wir diese Links auch hinzu.
    const rawPath = path.join(__dirname, 'index_raw');
    if (fs.existsSync(rawPath)) {
        const rawLines = fs.readFileSync(rawPath, 'utf8').split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
        rawLines.forEach(l => articleLinks.add(l));
    }

    let newlyAdded = 0;

    for (const url of articleLinks) {
        if (existingUrls.has(url)) {
            continue; // Schon bekannt
        }

        console.log(`Untersuche neuen Artikel: ${url}`);
        try {
            const articleRes = await axios.get(url);
            const $art = cheerio.load(articleRes.data);
            
            // Suche das Hauptbild im Artikel
            // Oft in figure, .field--name-field-image, oder einfach das erste große Bild
            let imgEl = $art('figure img').first();
            if (imgEl.length === 0) {
                imgEl = $art('.field--name-field-image img').first();
            }
            if (imgEl.length === 0) {
                imgEl = $art('.article-content img').first();
            }
            if (imgEl.length === 0) {
                imgEl = $art('img').filter((i, el) => {
                    const src = $art(el).attr('src') || '';
                    return src.includes('/styles/') || src.includes('/images/');
                }).first();
            }

            if (imgEl.length > 0) {
                let imgSrc = imgEl.attr('src');
                if (imgSrc && imgSrc.startsWith('/')) {
                    imgSrc = BASE_URL + imgSrc;
                }
                
                // Text/Bildunterschrift suchen
                let text = '';
                const figcaption = imgEl.closest('figure').find('figcaption').text().trim();
                if (figcaption) {
                    text = figcaption;
                } else {
                    text = imgEl.attr('alt') || imgEl.attr('title') || $art('h1').text().trim() || 'Foto ohne Titel';
                }
                
                // Datum suchen
                let datum = $art('.field--name-field-date').text().trim() || 
                            $art('time').text().trim() || 
                            'Unbekannt';

                // Cleanup text (remove multiple spaces, newlines)
                text = text.replace(/\s+/g, ' ');
                
                console.log(` -> Foto gefunden: ${imgSrc}`);
                
                existingData.push({
                    datum: datum,
                    text: text,
                    artikel: url,
                    foto: imgSrc
                });
                
                newlyAdded++;
            } else {
                console.log(" -> Kein passendes Foto im Artikel gefunden.");
            }
            
            // Kleine Pause um den Server nicht zu überlasten
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.error(`Fehler beim Verarbeiten von ${url}:`, e.message);
        }
    }

    if (newlyAdded > 0) {
        console.log(`Speichere ${newlyAdded} neue Einträge in index.yaml...`);
        const yamlStr = yaml.dump(existingData, {
            styles: {
                '!!null': 'empty' 
            },
            sortKeys: false
        });
        fs.writeFileSync(YAML_PATH, yamlStr, 'utf8');
        console.log("Fertig.");
    } else {
        console.log("Keine neuen Fotos gefunden. YAML ist aktuell.");
        // If file doesn't exist yet but we had no data, create it anyway
        if (!fs.existsSync(YAML_PATH)) {
            fs.writeFileSync(YAML_PATH, "[]", 'utf8');
        }
    }
}

scrapeFotos();
