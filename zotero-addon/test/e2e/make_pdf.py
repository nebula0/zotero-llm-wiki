"""Make the two-page test PDF used by the e2e test (includes a hyphenated line break)."""
import pymupdf, sys
doc = pymupdf.open()
texts = [
 ["Sparse Attention for Long Documents", "",
  "Abstract. We study how sparse attention patterns affect accuracy on long",
  "documents. Our main finding is that a sliding window of 512 tokens recovers",
  "ninety-four percent of full attention accuracy while using a fraction of",
  "the memory. The experi-",
  "mental setup uses three public benchmarks.", "",
  "1 Introduction", "",
  "Transformers scale quadratically with sequence length. Prior work proposed",
  "many approximations, but few compare them on equal hardware budgets."],
 ["2 Method", "",
  "We train each model for 100k steps with a batch size of 64. The window",
  "size is varied between 128 and 2048 tokens. Global tokens are added at",
  "every section heading.", "",
  "3 Limitations", "",
  "Our experiments only cover English text, and we did not test models larger",
  "than 1.3 billion parameters."],
]
for lines in texts:
    p = doc.new_page()
    y = 72
    for ln in lines:
        p.insert_text((72, y), ln, fontsize=11)
        y += 15
doc.save(sys.argv[1])
