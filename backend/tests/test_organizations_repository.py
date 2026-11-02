import pytest

from app.repositories.organizations import days_to_mask, mask_to_days


@pytest.mark.parametrize(
    "days, mask",
    [
        ([0, 1, 2, 3, 4], 0b0011111),  # Mon-Fri
        ([1, 2, 3, 4, 5], 0b0111110),  # Tue-Sat — not expressible as "first N days"
        ([6], 0b1000000),  # Sunday only
        (list(range(7)), 0b1111111),
    ],
)
def test_mask_round_trip(days, mask):
    assert days_to_mask(days) == mask
    assert mask_to_days(mask) == days
