"""Download the public FLDOE spreadsheets the ingest reads into data/raw/fldoe/ (then run `python -m app.ingest.build`).

The URLs are the 2025-26 releases; FLDOE publishes a new file id each year, so update them from
https://www.fldoe.org/accountability/accountability-reporting/school-grades/ and the Student Enrollment page when the new year lands.
"""
import sys
import urllib.request
from pathlib import Path

DEST = Path(__file__).resolve().parent.parent / "data" / "raw" / "fldoe"
FILES = {
    "SchoolGrades26.xlsx": "https://cdn.fldoe.org/file/18534/SchoolGrades26.xlsx",  # grades, learning gains, achievement, Title I
    "2526MembBySchoolByGrade.xlsx": "https://cdn.fldoe.org/file/7584/2526MembBySchoolByGrade.xlsx",  # 2025-26 Survey 2 enrollment
}

if __name__ == "__main__":
    DEST.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (miami-dade-school-navigator)"})
        data = urllib.request.urlopen(req, timeout=120).read()
        if not data.startswith(b"PK"):  # an .xlsx is a zip archive; anything else is an error page
            sys.exit(f"{name}: not an Excel file (got {data[:40]!r})")
        (DEST / name).write_bytes(data)
        print(f"{name}: {len(data):,} bytes")
