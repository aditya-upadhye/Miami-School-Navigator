"""Spec step: 'hand-check 5 addresses'. Prints the zoned schools for known addresses so a person can compare them with the
district's school locator (https://www.dadeschools.net). The expected values below are blank on purpose: fill them in once checked."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.context import load_navigator  # noqa: E402
from app.services.geocode import geocode  # noqa: E402
from app.services.zones import zoned_for  # noqa: E402

ADDRESSES = [
    "2250 NW 2nd Ave, Miami, FL 33127",   # Wynwood (demo family)
    "1450 NE 2nd Ave, Miami, FL 33132",   # M-DCPS headquarters, downtown
    "401 Biscayne Blvd, Miami, FL 33132",  # Bayfront Park area
    "11200 SW 8th St, Miami, FL 33199",   # FIU Modesto Maidique campus
    "1 Lincoln Rd, Miami Beach, FL 33139",
]

if __name__ == "__main__":
    nav = load_navigator()
    for a in ADDRESSES:
        try:
            g = geocode(nav, a)
            z = zoned_for(nav, g.lat, g.lon)
            print(f"{a}\n  geocoded: {g.matched_address} ({g.lat:.5f}, {g.lon:.5f}) via {g.source.split(':')[0]}")
            for lv in ("elementary", "middle", "high"):
                print(f"  {lv:<10} {', '.join(e.school_name or e.school_source_id for e in getattr(z, lv)) or '(none)'}")
        except Exception as exc:
            print(f"{a}\n  ERROR: {getattr(exc, 'message', exc)}")
