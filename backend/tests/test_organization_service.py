from app.services.organization_service import count_members_by_role


def test_counts_each_role():
    users = [{"role": "staff"}, {"role": "staff"}, {"role": "admin"}, {"role": "super_admin"}]
    assert count_members_by_role(users) == {"staff": 2, "admin": 1, "super_admin": 1}


def test_missing_roles_default_to_zero():
    assert count_members_by_role([{"role": "super_admin"}]) == {"staff": 0, "admin": 0, "super_admin": 1}
    assert count_members_by_role([]) == {"staff": 0, "admin": 0, "super_admin": 0}
