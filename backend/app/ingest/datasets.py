"""Registry of every external dataset the service ingests, with the provenance shown to API clients."""
from __future__ import annotations

from dataclasses import dataclass

COUNTY_ROOT = "https://gis.miamidade.gov/arcgis/rest/services"
EDU = f"{COUNTY_ROOT}/CommunityServices/MD_Educational/MapServer"
REC = f"{COUNTY_ROOT}/CommunityServices/MD_RecreationCulture/MapServer"
ADDR = f"{COUNTY_ROOT}/AddressSearchMap_PropertiesWithZip/MapServer"

COUNTY_ATTRIBUTION = "Miami-Dade County GIS Open Data (gis.miamidade.gov)"


@dataclass(frozen=True)
class ArcGisDataset:
    key: str  # also the snapshot file name
    title: str  # shown as `source` on every Field
    url: str  # ArcGIS layer URL, shown as `url`
    polygon: bool = False
    order_by: str | None = "OBJECTID"  # joined layers cannot be ordered by a bare field name
    out_fields: str = "*"


ARCGIS_DATASETS: dict[str, ArcGisDataset] = {d.key: d for d in [
    ArcGisDataset("county_school_sites", "Miami-Dade County GIS: MD_Educational / SchoolSite (M-DCPS schools)", f"{EDU}/2"),
    ArcGisDataset("county_charter_schools", "Miami-Dade County GIS: MD_Educational / CharterSchool", f"{EDU}/3"),
    ArcGisDataset("county_private_schools", "Miami-Dade County GIS: MD_Educational / PrivateSchool", f"{EDU}/8"),
    ArcGisDataset("county_daycare", "Miami-Dade County GIS: MD_Educational / Daycare (licensed child care)", f"{EDU}/1"),
    ArcGisDataset("county_head_start", "Miami-Dade County GIS: MD_Educational / HeadStart", f"{EDU}/5"),
    ArcGisDataset("county_zone_elementary", "Miami-Dade County GIS: ElementaryAttendanceBoundary", f"{EDU}/9", polygon=True, order_by=None),
    ArcGisDataset("county_zone_middle", "Miami-Dade County GIS: MiddleAttendanceBoundary", f"{EDU}/11", polygon=True, order_by=None),
    ArcGisDataset("county_zone_high", "Miami-Dade County GIS: HighAttendanceBoundary", f"{EDU}/10", polygon=True, order_by=None),
    ArcGisDataset("county_libraries", "Miami-Dade County GIS: MD_Educational / Library (Miami-Dade Public Library System)", f"{EDU}/6"),
    ArcGisDataset("county_municipal_libraries", "Miami-Dade County GIS: MD_Educational / MunicipalLibrary", f"{EDU}/7"),
    ArcGisDataset("county_parks_municipal", "Miami-Dade County GIS: MD_RecreationCulture / MunicipalPark", f"{REC}/0"),
    ArcGisDataset("county_parks_county", "Miami-Dade County GIS: MD_RecreationCulture / CountyOperatedPark", f"{REC}/1"),
    ArcGisDataset("county_zip_codes", "Miami-Dade County GIS: AddressSearchMap / ZipCode", f"{ADDR}/2", polygon=True),
]}

# Address-point layer used by the geocoder at request time (a lookup service, not an ingested dataset).
ADDRESS_POINTS_URL = f"{ADDR}/0"
ADDRESS_POINTS_TITLE = "Miami-Dade County GIS: AddressSearchMap / Address (county address points)"

CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"

FLDOE_PAGES = {
    "fldoe_school_grades": ("FLDOE School Grades", "https://www.fldoe.org/accountability/accountability-reporting/school-grades/"),
    "fldoe_learning_gains": ("FLDOE Learning Gains by School", "https://www.fldoe.org/accountability/accountability-reporting/school-grades/"),
    "fldoe_enrollment": ("FLDOE Student Enrollment by School (Survey 2)", "https://www.fldoe.org/accountability/data-sys/edu-info-accountability-services/pk-12-public-school-data-pubs-reports/students.stml"),
    "fldoe_charter_directory": ("FLDOE Charter School Directory", "https://www.fldoe.org/schools/school-choice/charter-schools/"),
    "fldoe_private_directory": ("FLDOE Private School Directory", "https://www.fldoe.org/schools/school-choice/private-schools/private-school-directory.stml"),
}
