import os
import glob
import yaml
import exifread

def convert_to_degrees(value):
    """Helper function to convert the GPS coordinates stored in the EXIF to degrees in float format"""
    d = float(value.values[0].num) / float(value.values[0].den)
    m = float(value.values[1].num) / float(value.values[1].den)
    s = float(value.values[2].num) / float(value.values[2].den)
    return d + (m / 60.0) + (s / 3600.0)

def extract_exif_data(filepath):
    metadata = {}
    try:
        with open(filepath, 'rb') as f:
            tags = exifread.process_file(f, details=False)
            
            # Date and Time
            if 'EXIF DateTimeOriginal' in tags:
                dt = str(tags['EXIF DateTimeOriginal'])
                if ' ' in dt:
                    date_part, time_part = dt.split(' ', 1)
                    # Convert YYYY:MM:DD to DD.MM.YYYY
                    date_parts = date_part.split(':')
                    if len(date_parts) == 3:
                        metadata['datum'] = f"{date_parts[2]}.{date_parts[1]}.{date_parts[0]}"
                    # Extract HH:MM
                    time_parts = time_part.split(':')
                    if len(time_parts) >= 2:
                        metadata['zeit'] = f"{time_parts[0]}:{time_parts[1]}"
            
            # GPS
            if 'GPS GPSLatitude' in tags and 'GPS GPSLongitude' in tags and \
               'GPS GPSLatitudeRef' in tags and 'GPS GPSLongitudeRef' in tags:
                
                lat = convert_to_degrees(tags['GPS GPSLatitude'])
                if str(tags['GPS GPSLatitudeRef']) == 'S':
                    lat = -lat
                    
                lon = convert_to_degrees(tags['GPS GPSLongitude'])
                if str(tags['GPS GPSLongitudeRef']) == 'W':
                    lon = -lon
                    
                metadata['ort'] = [round(lat, 6), round(lon, 6)]
                
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
    return metadata

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Assuming script is run from fotos/Frank/
    os.chdir(script_dir)
    
    yaml_path = os.path.join("..", "index.yaml")
    
    # Load existing YAML
    existing_data = []
    if os.path.exists(yaml_path):
        with open(yaml_path, 'r', encoding='utf-8') as f:
            existing_data = yaml.safe_load(f) or []
            
    # Map for easy lookup
    foto_map = {entry['foto']: entry for entry in existing_data if 'foto' in entry}
    
    jpg_files = glob.glob("*.jpg") + glob.glob("*.jpeg") + glob.glob("*.JPG") + glob.glob("*.JPEG")
    
    updated_count = 0
    new_count = 0
    
    for filename in jpg_files:
        filepath = filename
        exif_data = extract_exif_data(filepath)
        
        foto_ref = f"fotos/Frank/{filename}"
        
        if foto_ref in foto_map:
            entry = foto_map[foto_ref]
            # Update missing attributes
            if 'datum' in exif_data and not entry.get('datum'):
                entry['datum'] = exif_data['datum']
            if 'zeit' in exif_data:
                entry['zeit'] = exif_data['zeit']
            if 'ort' in exif_data:
                entry['ort'] = exif_data['ort']
            updated_count += 1
        else:
            # Create new entry
            entry = {
                'foto': foto_ref,
                'text': "",
                'artikel': "",
                'datum': exif_data.get('datum', ''),
                'zeit': exif_data.get('zeit', ''),
            }
            if 'ort' in exif_data:
                entry['ort'] = exif_data['ort']
                
            existing_data.append(entry)
            foto_map[foto_ref] = entry
            new_count += 1

    # Save YAML
    class BlankNone(yaml.SafeDumper):
        def represent_none(self, _):
            return self.represent_scalar('tag:yaml.org,2002:null', '')
            
    BlankNone.add_representer(type(None), BlankNone.represent_none)

    with open(yaml_path, 'w', encoding='utf-8') as f:
        yaml.dump(existing_data, f, Dumper=BlankNone, default_flow_style=False, sort_keys=False, allow_unicode=True)
        
    print(f"Done! Created {new_count} new entries. Updated {updated_count} existing entries.")

if __name__ == "__main__":
    main()
