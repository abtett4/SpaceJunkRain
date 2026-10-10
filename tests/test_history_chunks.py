import hashlib
import json
from pathlib import Path
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from build_history_chunks import build_chunks

class HistoryChunksTests(unittest.TestCase):
    def test_reproducible_complete_year_and_preserved_evidence(self):
        target=ROOT/'web/data/history/2018'
        source=ROOT/'web/data/samples/april-2018-launch/tracers.json'
        files=build_chunks(ROOT/'web/data/decays.json',source,target)
        for name,data in files.items():
            self.assertEqual(data,(target/name).read_bytes())
        index=json.loads(files['index.json'])
        self.assertEqual(sum(c['eventCount'] for c in index['chunks']),252)
        self.assertEqual(sum(c['reentryCount'] for c in index['chunks']),251)
        ids=[]
        for chunk in index['chunks']:
            self.assertEqual(hashlib.sha256(files[chunk['asset']]).hexdigest(),chunk['sha256'])
            ids.extend(e['eventId'] for e in json.loads(files[chunk['asset']])['events'])
        self.assertEqual(len(ids),len(set(ids)))
        april={e['eventId']:e for e in json.loads(files['2018-04.json'])['events']}
        for original in json.loads(source.read_text())['events']:
            exported=april[original['eventId']]
            for key in original:
                if key!='orbitalData': self.assertEqual(original[key],exported[key])
            for kind,product in original['orbitalData'].items():
                self.assertEqual((source.parent/product['asset']).resolve(),(target/exported['orbitalData'][kind]['asset']).resolve())

if __name__=='__main__': unittest.main()
