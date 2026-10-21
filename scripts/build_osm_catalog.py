#!/usr/bin/env python3
"""Build BOR's offline venue catalog from the OSM Uzbekistan extract."""
import json,pathlib,tempfile,urllib.request,math,collections
import osmium
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'osm-tashkent.json'
HINTS=ROOT/'public'/'osm-location-hints.json'
URL='https://download.geofabrik.de/asia/uzbekistan-latest.osm.pbf'
class Venues(osmium.SimpleHandler):
 def __init__(self):
  super().__init__();self.by_id={};self.roads=collections.defaultdict(list)
 def capture(self,kind,ident,tags,latitude,longitude):
  if not(41.18<=latitude<=41.45 and 69.08<=longitude<=69.49):return
  category=tags.get('amenity')
  if category not in ('cafe','restaurant'):return
  name=(tags.get('name:ru') or tags.get('name') or '').strip()
  if not 2<=len(name)<=120:return
  address=', '.join(x for x in ((tags.get('addr:street') or '').strip(),(tags.get('addr:housenumber') or '').strip()) if x) or 'Адрес не указан в OpenStreetMap'
  district=(tags.get('addr:suburb') or tags.get('addr:district') or 'Ташкент').strip() or 'Ташкент'
  key=kind+'/'+str(ident)
  self.by_id[key]={'sourceId':key,'name':name,'district':district[:80],'address':address[:240],'category':category,'latitude':round(latitude,7),'longitude':round(longitude,7)}
 def node(self,n):
  if n.location.valid():self.capture('node',n.id,n.tags,n.location.lat,n.location.lon)
 def way(self,w):
  tags=w.tags
  coords=[(a.location.lat,a.location.lon) for a in w.nodes if a.location.valid()]
  if tags.get('highway') in ('residential','tertiary','secondary','primary','living_street','unclassified','pedestrian','service') and tags.get('name') and coords:
   name=(tags.get('name:ru') or tags.get('name') or '').strip()
   if 3<=len(name)<=95:
    for lat,lon in coords[::max(1,len(coords)//24)]:
     if 41.17<=lat<=41.46 and 69.07<=lon<=69.50:
      self.roads[(int(lat*700),int(lon*700))].append((lat,lon,name))
  if tags.get('amenity') not in ('cafe','restaurant'):return
  if coords:self.capture('way',w.id,tags,sum(a for a,b in coords)/len(coords),sum(b for a,b in coords)/len(coords))
def nearby_street(roads,lat,lon):
 y=int(lat*700);x=int(lon*700);best=None
 for dy in range(-2,3):
  for dx in range(-2,3):
   for a,b,name in roads.get((y+dy,x+dx),()):
    meters=math.hypot((lat-a)*111195,(lon-b)*111195*math.cos(math.radians(lat)))
    if best is None or meters<best[0]:best=(meters,name)
 if best and best[0]<=180:return {'street':best[1],'distanceMeters':int(round(best[0]))}
 return None
def main():
 with tempfile.TemporaryDirectory() as temp:
  path=pathlib.Path(temp)/'uzbekistan.osm.pbf'
  req=urllib.request.Request(URL,headers={'User-Agent':'BOR-venue-catalog/1.0 (OpenStreetMap ODbL)'})
  print('Downloading OSM Uzbekistan extract',flush=True)
  with urllib.request.urlopen(req,timeout=120) as r,open(path,'wb') as f:
   while True:
    part=r.read(1024*1024)
    if not part:break
    f.write(part)
  print('Downloaded MB:',round(path.stat().st_size/1024/1024,2),flush=True)
  if path.stat().st_size<100000:raise RuntimeError('OSM extract is unexpectedly small')
  handler=Venues();handler.apply_file(str(path),locations=True)
  if len(handler.by_id)<20:raise RuntimeError('OSM extract yielded fewer than 20 places; old data preserved')
  OUT.parent.mkdir(parents=True,exist_ok=True)
  OUT.write_text(json.dumps({'source':'OpenStreetMap/Geofabrik','attribution':'© OpenStreetMap contributors (ODbL)','area':'Ташкент','options':sorted(handler.by_id.values(),key=lambda p:p['name'].casefold())},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
  suggestions={}
  for ident,p in handler.by_id.items():
   if p['address']=='Адрес не указан в OpenStreetMap' or p['address'].strip().replace('/','').isdigit():
    street=nearby_street(handler.roads,p['latitude'],p['longitude'])
    if street:suggestions[ident]=street
  HINTS.write_text(json.dumps({'source':'OpenStreetMap/Geofabrik','description':'Ближайшая именованная улица — ориентир, не подтверждённый адрес','suggestions':suggestions},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
  print('Prepared',len(handler.by_id),'real venues and',len(suggestions),'street hints',flush=True)
if __name__=='__main__':main()
