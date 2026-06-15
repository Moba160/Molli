import urllib.request
import urllib.parse
import re
import os
import yaml

BASE_URL = "https://eisenbahnstiftung.de/bildergalerie"
DOMAIN = "https://eisenbahnstiftung.de"
YAML_FILE = "index.yaml"

# Die Suchbegriffe
KEYWORDS = [
    "Molli", "K\u00fchlungsborn", "Bad Doberan", "Heiligendamm", 
    "99 2321", "99 2322", "99 2323", "99 2324", "99 331", "99 332"
]

def extract_photos():
    print("Lese existierende index.yaml...")
    if os.path.exists(YAML_FILE):
        with open(YAML_FILE, 'r', encoding='utf-8') as f:
            fotos_data = yaml.safe_load(f) or []
    else:
        fotos_data = []

    existing_urls = set()
    for f in fotos_data:
        if 'foto' in f:
            existing_urls.add(f['foto'])

    new_fotos_count = 0

    for keyword in KEYWORDS:
        print(f"\nSuche nach: {keyword}...")
        
        # Use ISO-8859-1 for POST data as it seems the site uses it internally
        data = urllib.parse.urlencode({'search': keyword.encode('windows-1252')}).encode('ascii')
        req = urllib.request.Request(BASE_URL, data=data)
        
        try:
            with urllib.request.urlopen(req) as response:
                html_bytes = response.read()
                # Try UTF-8 first, fallback to windows-1252
                try:
                    html = html_bytes.decode('utf-8')
                except UnicodeDecodeError:
                    html = html_bytes.decode('windows-1252', errors='replace')
        except Exception as e:
            print(f"Fehler beim Abrufen der Seite f\u00fcr {keyword}: {e}")
            continue

        # Finde alle <img class="openMe ...">
        img_tags = re.findall(r'<img[^>]*class="[^"]*openMe[^"]*"[^>]*>', html)
        
        for img_tag in img_tags:
            # Extrahiere Attribute
            id_match = re.search(r'id="([^"]+)"', img_tag)
            src_match = re.search(r'src="([^"]+)"', img_tag)
            alt_match = re.search(r'alt="([^"]*)"', img_tag)
            title_match = re.search(r'title="([^"]*)"', img_tag)
            
            if not id_match or not src_match:
                continue
                
            full_img_url = DOMAIN + id_match.group(1)
            thumb_url = DOMAIN + src_match.group(1)
            
            # HTML entities im Text decodieren
            import html as html_lib
            alt_text = html_lib.unescape(alt_match.group(1)) if alt_match else ""
            title_text = html_lib.unescape(title_match.group(1)) if title_match else ""
            
            # Kombiniere zu einem Text
            text = f"<b>{title_text}</b><br>{alt_text}" if title_text else alt_text
            
            if full_img_url in existing_urls:
                continue
                
            # Versuche ein Datum am Ende des Textes zu finden: (dd.mm.yyyy) oder (yyyy)
            datum = ""
            date_match = re.search(r'\(([0-9]{2}\.[0-9]{2}\.[0-9]{4}|[0-9]{4})\)(?:[^()]*)$', alt_text)
            if date_match:
                datum = date_match.group(1)
                
            new_entry = {
                'foto': full_img_url,
                'thumb': thumb_url,
                'text': text,
                'datum': datum,
                'quelle': 'Eisenbahnstiftung'
            }
            
            fotos_data.append(new_entry)
            existing_urls.add(full_img_url)
            new_fotos_count += 1
            # Using ascii encoding for print to avoid powershell console errors
            safe_print = title_text.encode('ascii', 'replace').decode('ascii')
            print(f"Neu gefunden: {safe_print}")

    if new_fotos_count > 0:
        print(f"\nSpeichere {new_fotos_count} neue Fotos in {YAML_FILE}...")
        # Custom dumper to format yaml nicely
        class Dumper(yaml.Dumper):
            def increase_indent(self, flow=False, indentless=False):
                return super(Dumper, self).increase_indent(flow, False)
                
        with open(YAML_FILE, 'w', encoding='utf-8') as f:
            yaml.dump(fotos_data, f, Dumper=Dumper, default_flow_style=False, allow_unicode=True, sort_keys=False)
        print("Fertig!")
    else:
        print("\nKeine neuen Fotos gefunden.")

if __name__ == "__main__":
    extract_photos()
