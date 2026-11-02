# Roles are listed explicitly (rather than counting whatever role strings
# show up) so the Company page always gets all three keys, zero included.
ROLES = ("staff", "admin", "super_admin")


def count_members_by_role(users: list[dict]) -> dict[str, int]:
    counts = dict.fromkeys(ROLES, 0)
    for user in users:
        if user["role"] in counts:
            counts[user["role"]] += 1
    return counts
