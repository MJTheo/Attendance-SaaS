from supabase import Client

from app.repositories.attendance import AttendanceRepository
from app.repositories.corrections import CorrectionsRepository


class AttendanceRecordNotFoundError(Exception):
    pass


class CorrectionNotFoundError(Exception):
    pass


class CorrectionAlreadyResolvedError(Exception):
    pass


class CorrectionsService:
    def __init__(self, user_client: Client, service_client: Client):
        self._corrections = CorrectionsRepository(user_client)
        self._user_attendance = AttendanceRepository(user_client)
        self._service_attendance = AttendanceRepository(service_client)

    def request_correction(
        self, org_id: str, user_id: str, attendance_record_id: str, reason: str, new_value: dict
    ) -> dict:
        record = self._user_attendance.get_by_id(attendance_record_id)
        if record is None:
            raise AttendanceRecordNotFoundError()

        old_value = {field: record.get(field) for field in new_value}
        return self._corrections.create(org_id, attendance_record_id, user_id, reason, old_value, new_value)

    def list_corrections(self) -> list[dict]:
        return self._corrections.list_all()

    def resolve(self, correction_id: str, admin_id: str, approve: bool) -> dict:
        correction = self._corrections.get(correction_id)
        if correction is None:
            raise CorrectionNotFoundError()
        if correction["status"] != "pending":
            raise CorrectionAlreadyResolvedError()

        if approve:
            self._service_attendance.apply_correction(correction["attendance_record_id"], correction["new_value"])

        return self._corrections.mark_resolved(correction_id, admin_id, "approved" if approve else "rejected")
