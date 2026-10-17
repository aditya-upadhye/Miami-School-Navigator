import pytest

from app.domain import grade_label_for_age, haversine_mi, parse_grades, stage_for_age, stages_for_grades


@pytest.mark.parametrize("text,expected", [
    ("PK-5", [-1, 0, 1, 2, 3, 4, 5]), ("K-8", list(range(0, 9))), ("9-12", [9, 10, 11, 12]), ("09-12", [9, 10, 11, 12]),
    ("PK-KG", [-1, 0]), ("KG-12", list(range(0, 13))), ("PreK-2", [-1, 0, 1, 2]), ("PK6-12", [-1, 6, 7, 8, 9, 10, 11, 12]),
    ("PK", [-1]), ("K", [0]), ("6 – 8", [6, 7, 8]), ("0", []), ("", []), (None, []), ("garbage", []),
])
def test_parse_grades(text, expected):
    assert parse_grades(text) == expected


def test_stages_for_grades():
    assert stages_for_grades(parse_grades("PK-8")) == ["pre_k", "elementary", "middle"]
    assert stages_for_grades(parse_grades("6-12")) == ["middle", "high"]


@pytest.mark.parametrize("age,stage", [(0, "infant_toddler"), (2, "infant_toddler"), (3, "pre_k"), (4, "pre_k"), (5, "elementary"), (7, "elementary"),
                                       (10, "elementary"), (11, "middle"), (13, "middle"), (14, "high"), (17, "high"), (18, None)])
def test_stage_for_age(age, stage):
    assert stage_for_age(age) == stage


def test_grade_labels():
    assert grade_label_for_age(7) == "Grade 2" and grade_label_for_age(4) == "VPK (Pre-K 4)" and grade_label_for_age(5) == "Kindergarten"


def test_haversine():
    # 1 degree of latitude is ~69 miles
    assert 68.5 < haversine_mi(25.0, -80.0, 26.0, -80.0) < 69.5
