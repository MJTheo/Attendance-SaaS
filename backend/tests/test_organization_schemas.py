import pytest
from pydantic import ValidationError

from app.schemas.organization import ORG_NAME_MAX_LENGTH, RenameOrganization, UpdateOrgSettings


def test_rename_trims_whitespace():
    assert RenameOrganization(name="  Acme Corp  ").name == "Acme Corp"


@pytest.mark.parametrize("name", ["", "   ", "\t\n"])
def test_rename_rejects_blank(name):
    with pytest.raises(ValidationError):
        RenameOrganization(name=name)


def test_rename_length_limit():
    assert RenameOrganization(name="x" * ORG_NAME_MAX_LENGTH).name == "x" * ORG_NAME_MAX_LENGTH
    with pytest.raises(ValidationError):
        RenameOrganization(name="x" * (ORG_NAME_MAX_LENGTH + 1))


def test_settings_dedupes_and_sorts_working_days():
    assert UpdateOrgSettings(working_days=[4, 1, 1, 2]).working_days == [1, 2, 4]


def test_settings_rejects_empty_working_days():
    with pytest.raises(ValidationError):
        UpdateOrgSettings(working_days=[])


def test_settings_rejects_unknown_timezone():
    with pytest.raises(ValidationError):
        UpdateOrgSettings(timezone="Mars/Olympus_Mons")


def test_settings_accepts_iana_timezone():
    assert UpdateOrgSettings(timezone="Asia/Manila").timezone == "Asia/Manila"


def test_settings_requires_at_least_one_field():
    with pytest.raises(ValidationError):
        UpdateOrgSettings()
