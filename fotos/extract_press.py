import os
import sys
import time
import re
import yaml
import requests
from bs4 import BeautifulSoup

BASE_URL = 'https://www.presskurier.de'
THEME_URL = f'{BASE_URL}/thema/mecklenburgische-baderbahn'
DIR_PATH = os.path.dirname(os.path.realpath(__file__))
YAML_PATH = os.path.join(DIR_PATH, 'index.yaml')
RAW_PATH = os.path.join(DIR_PATH, 'index_raw')

def scrape_fotos():
    print(f"Lese aktuelle Fotos aus: {YAML_PATH}")
    existing_data = []
    if os.path.exists(YAML_PATH):
        with open(YAML_PATH, 'r', encoding='utf-8') as f:
            existing_data = yaml.safe_load(f) or []
            
    existing_urls = set(item.get('artikel', item.get('url_artikel', '')) for item in existing_data)

    print(f"Lade Übersichtsseite: {THEME_URL}")
    try:
        res = requests.get(THEME_URL)
        res.raise_for_status()
        html = res.text
    except Exception as e:
        print(f"Fehler beim Laden der Übersichtsseite: {e}")
        return

    soup = BeautifulSoup(html, 'html.parser')
    article_links = set()
    
    for a in soup.find_all('a', href=True):
        href = a['href']
        if re.match(r'^\/\d+\/[a-z0-9-]+$', href):
            article_links.add(BASE_URL + href)
        elif href.startswith('https://www.presskurier.de/') and re.search(r'presskurier\.de\/\d+\/[a-z0-9-]+$', href):
            article_links.add(href)
            
    print(f"{len(article_links)} Artikel-Links gefunden.")
    
    if os.path.exists(RAW_PATH):
        with open(RAW_PATH, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith('http'):
                    article_links.add(line)

    newly_added = 0

    for url in article_links:
        if url in existing_urls:
            continue

        print(f"Untersuche neuen Artikel: {url}")
        try:
            art_res = requests.get(url)
            art_res.raise_for_status()
            art_soup = BeautifulSoup(art_res.text, 'html.parser')
            
            img_el = None
            for selector in ['figure img', '.field--name-field-image img', '.article-content img']:
                img_el = art_soup.select_one(selector)
                if img_el:
                    break
            
            if not img_el:
                for img in art_soup.find_all('img'):
                    src = img.get('src', '')
                    if '/styles/' in src or '/images/' in src:
                        img_el = img
                        break

            if img_el:
                img_src = img_el.get('data-srcset', '')
                if img_src:
                    img_src = img_src.split(',')[0].strip().split(' ')[0]
                else:
                    img_src = img_el.get('src', '')
                    
                if img_src.startswith('/'):
                    img_src = BASE_URL + img_src
                
                text = img_el.get('title') or img_el.get('alt') or ''
                if not text:
                    figure = img_el.find_parent('figure')
                    if figure and figure.find('figcaption'):
                        text = figure.find('figcaption').get_text(strip=True)
                    else:
                        h1 = art_soup.find('h1')
                        if h1: text = h1.get_text(strip=True)
                
                text = text or 'Foto ohne Titel'
                text = re.sub(r'\s+', ' ', text)
                
                datum = 'Unbekannt'
                date_el = art_soup.select_one('.field--name-field-date') or art_soup.find('time')
                if date_el:
                    datum = date_el.get_text(strip=True)
                    
                # Try to extract date from text if it has the format " | DD.MM.YYYY"
                m_date = re.search(r'\|\s*(\d{2}\.\d{2}\.\d{4})\s*\|?', text)
                if m_date:
                    datum = m_date.group(1)
                
                print(f" -> Foto gefunden: {img_src}")
                
                existing_data.append({
                    'datum': datum,
                    'text': text,
                    'artikel': url,
                    'foto': img_src,
                    'quelle': "Preß'-Kurier"
                })
                
                newly_added += 1
            else:
                print(" -> Kein passendes Foto im Artikel gefunden.")
                
            time.sleep(1)
        except Exception as e:
            print(f"Fehler beim Verarbeiten von {url}: {e}")

    # Update existing entries with quelle and remove obsolete ones
    original_count = len(existing_data)
    
    def is_presskurier(item):
        return 'presskurier.de' in item.get('artikel', '') or 'presskurier.de' in item.get('foto', '') or item.get('quelle') == "Preß'-Kurier"
        
    filtered_data = []
    for item in existing_data:
        if is_presskurier(item):
            # If it's a presskurier item, it MUST be in article_links to be kept
            if item.get('artikel') in article_links:
                item['quelle'] = "Preß'-Kurier"
                filtered_data.append(item)
        else:
            filtered_data.append(item)
            
    existing_data = filtered_data
    removed = original_count - len(existing_data)

    if newly_added > 0 or removed > 0:
        if removed > 0:
            print(f"Entferne {removed} nicht mehr verlinkte Artikel.")
        print(f"Speichere neue Einträge in index.yaml...")
        with open(YAML_PATH, 'w', encoding='utf-8') as f:
            yaml_str = yaml.dump(existing_data, allow_unicode=True, default_flow_style=False, sort_keys=False)
            yaml_str = yaml_str.replace('\n- ', '\n\n- ')
            f.write(yaml_str)
        print("Fertig.")
    else:
        print("Keine neuen Fotos gefunden und keine entfernt. YAML ist aktuell.")
        if not os.path.exists(YAML_PATH):
            with open(YAML_PATH, 'w', encoding='utf-8') as f:
                f.write("[]\n")

if __name__ == "__main__":
    scrape_fotos()
