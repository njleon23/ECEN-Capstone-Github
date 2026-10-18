import unittest

from app.analysis.models import SourceRecord
from app.analysis.retrieval import Retriever
from app.analysis.chunking import chunk_source

from analysis_helpers import item, sample_retriever


def _src(sid, text, approved=True, stype="minutes", date="2024-01-01"):
    return SourceRecord(source_id=sid, title=f"Source {sid}", source_type=stype, text=text,
                        source_date=date, approved=approved)


class ChunkingTests(unittest.TestCase):
    def test_passages_keep_source_and_location(self):
        s = _src("a", "First paragraph about roads.\n\nSecond paragraph about parks.")
        passages = chunk_source(s)
        self.assertEqual(len(passages), 1)               # packed together
        p = passages[0]
        self.assertEqual((p.source_id, p.source_title), ("a", "Source a"))
        self.assertEqual(p.location, "paragraphs 1-2")
        self.assertEqual(p.source_date, "2024-01-01")

    def test_long_text_is_split_into_multiple_passages(self):
        para = " ".join(f"word{i}" for i in range(50))
        s = _src("b", "\n\n".join([para] * 6))
        passages = chunk_source(s, max_words=120)
        self.assertGreater(len(passages), 1)
        self.assertTrue(all(len(p.text.split()) <= 120 for p in passages))
        ids = [p.passage_id for p in passages]
        self.assertEqual(len(ids), len(set(ids)))

    def test_page_breaks_are_reported(self):
        s = _src("c", "Page one text here.\fPage two text here.")
        locations = [p.location for p in chunk_source(s)]
        self.assertEqual(locations, ["page 1, paragraph 1", "page 2, paragraph 1"])

    def test_run_on_text_is_hard_split(self):
        s = _src("d", " ".join(["alpha"] * 300))
        self.assertTrue(all(len(p.text.split()) <= 120 for p in chunk_source(s)))


class RetrievalTests(unittest.TestCase):
    def test_finds_prior_zoning_minutes(self):
        r = sample_retriever()
        results = r.search("zoning request Brazos Ridge Development", top_k=3)
        self.assertEqual(results[0].passage.source_id, "min-2024-03")
        self.assertGreater(results[0].relevance, 0.3)

    def test_unapproved_sources_are_never_returned(self):
        r = sample_retriever()
        results = r.search("zoning change request Brazos Ridge Development opposition", top_k=20)
        self.assertNotIn("min-draft-unapproved", {x.passage.source_id for x in results})

    def test_approval_change_takes_effect_without_reindex(self):
        r = sample_retriever()
        r.set_approved("min-draft-unapproved", True)
        results = r.search("zoning change request Brazos Ridge Development opposition", top_k=20)
        self.assertIn("min-draft-unapproved", {x.passage.source_id for x in results})
        r.set_approved("min-draft-unapproved", False)
        results = r.search("zoning change request Brazos Ridge Development opposition", top_k=20)
        self.assertNotIn("min-draft-unapproved", {x.passage.source_id for x in results})

    def test_source_id_and_type_filters(self):
        r = sample_retriever()
        only = r.search("Main Street redevelopment cost", source_ids=["bud-cip"], top_k=10)
        self.assertEqual({x.passage.source_id for x in only}, {"bud-cip"})
        types = r.search("Main Street redevelopment cost", source_types=["budget"], top_k=10)
        self.assertTrue(all(x.passage.source_type == "budget" for x in types))

    def test_ranking_is_deterministic(self):
        r = sample_retriever()
        a = [x.passage.passage_id for x in r.search("downtown traffic construction", top_k=8)]
        b = [x.passage.passage_id for x in r.search("downtown traffic construction", top_k=8)]
        self.assertEqual(a, b)

    def test_unrelated_query_returns_nothing_above_threshold(self):
        r = sample_retriever()
        res = r.search("airport runway length", min_relevance=0.15, min_matched_terms=2)
        self.assertEqual(res, [])

    def test_empty_index_and_empty_query(self):
        self.assertEqual(Retriever().search("anything"), [])
        self.assertEqual(sample_retriever().search("the of and"), [])

    def test_reindexing_replaces_old_passages(self):
        r = Retriever()
        r.add_source(_src("x", "Sidewalk repair funding discussion for the north district."))
        r.add_source(_src("x", "Library hours extension request from residents."))
        self.assertEqual(r.search("sidewalk repair funding"), [])
        self.assertTrue(r.search("library hours extension"))

    def test_optional_embedder_is_used(self):
        class FakeEmbedder:
            VOCAB = ["zoning", "noise", "traffic", "budget", "parks"]

            def embed(self, texts):
                return [[t.lower().count(w) for w in self.VOCAB] for t in texts]

        r = Retriever(embedder=FakeEmbedder())
        for s in [_src("z", "Zoning hearing with noise complaints from neighbors nearby."),
                  _src("p", "Parks budget summary for the recreation department this year.")]:
            r.add_source(s)
        res = r.search("zoning noise concerns", top_k=2)
        self.assertEqual(res[0].passage.source_id, "z")

    def test_item_query_finds_cost_records_for_main_street(self):
        r = sample_retriever()
        from app.analysis.scoring import retrieval_query_for
        res = r.search(retrieval_query_for(item("item-4")), top_k=8,
                       min_relevance=0.15, min_matched_terms=2)
        found = {x.passage.source_id for x in res}
        self.assertTrue({"bud-cip", "chk-lsc"} <= found)


if __name__ == "__main__":
    unittest.main()
