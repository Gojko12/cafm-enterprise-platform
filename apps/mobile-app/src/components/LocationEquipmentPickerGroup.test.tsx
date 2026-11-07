import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Building, Equipment, Floor, Room } from "@cafm/shared-schema";
import { LocationEquipmentPickerGroup } from "./LocationEquipmentPickerGroup";

const buildings: Building[] = [
  {
    bl_id: "BL-2",
    Name: "Second Building",
    Address: "Address 2",
    SiteId: "SITE-01",
    IsActive: true,
  },
  {
    bl_id: "BL-1",
    Name: "First Building",
    Address: "Address 1",
    SiteId: "SITE-01",
    IsActive: true,
  },
];
const floors: Floor[] = [
  {
    bl_id: "BL-1",
    LevelName: "Floor 1",
    FloorNumber: 1,
    SiteId: "SITE-01",
    IsActive: true,
  },
  {
    bl_id: "BL-2",
    LevelName: "Ground Floor",
    FloorNumber: 0,
    SiteId: "SITE-01",
    IsActive: true,
  },
];
const rooms: Room[] = [
  {
    bl_id: "BL-2",
    LevelName: "Ground Floor",
    RoomCode: "R-2",
    Name: "Second Room",
    SiteId: "SITE-01",
    IsDeskReservable: false,
    IsActive: true,
  },
  {
    bl_id: "BL-1",
    LevelName: "Floor 1",
    RoomCode: "R-1",
    Name: "First Room",
    SiteId: "SITE-01",
    IsDeskReservable: false,
    IsActive: true,
  },
];
const equipment: Equipment[] = [
  {
    EquipmentCode: "EQ-2",
    EquipmentName: "Second Equipment",
    bl_id: "BL-2",
    LevelName: "Ground Floor",
    RoomCode: "R-2",
    SiteId: "SITE-01",
    IsInstallation: false,
    Status: "Active",
    TechnicalSpecifications: {},
  },
  {
    EquipmentCode: "EQ-1",
    EquipmentName: "First Equipment",
    bl_id: "BL-1",
    LevelName: "Floor 1",
    RoomCode: "R-1",
    SiteId: "SITE-01",
    IsInstallation: false,
    Status: "Active",
    TechnicalSpecifications: {},
  },
];

function ControlledPicker({
  initialBuilding = null,
  initialFloor = null,
  initialRoom = null,
  onEquipmentChange,
}: {
  initialBuilding?: Building | null;
  initialFloor?: Floor | null;
  initialRoom?: Room | null;
  onEquipmentChange?: (codes: Set<string>) => void;
}) {
  const [building, setBuilding] = useState(initialBuilding);
  const [floor, setFloor] = useState(initialFloor);
  const [room, setRoom] = useState(initialRoom);
  const [equipmentCodes, setEquipmentCodes] = useState(new Set<string>());
  return (
    <LocationEquipmentPickerGroup
      buildings={buildings}
      floors={floors}
      rooms={rooms}
      equipment={equipment}
      selectedBuilding={building}
      selectedFloor={floor}
      selectedRoom={room}
      selectedEquipmentCodes={equipmentCodes}
      onLocationChange={({ building: nextBuilding, floor: nextFloor, room: nextRoom }) => {
        setBuilding(nextBuilding);
        setFloor(nextFloor);
        setRoom(nextRoom);
      }}
      onEquipmentChange={(codes) => {
        setEquipmentCodes(codes);
        onEquipmentChange?.(codes);
      }}
    />
  );
}

describe("LocationEquipmentPickerGroup", () => {
  it("resolves building and floor when a room is selected", () => {
    render(<ControlledPicker />);
    fireEvent.click(screen.getAllByRole("button", { name: "Select..." })[2]);
    const dialog = screen.getByRole("dialog", { name: "Select Room" });
    fireEvent.change(within(dialog).getByRole("searchbox"), {
      target: { value: "R-2" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Select" }));

    expect(
      (screen.getByRole("textbox", { name: "Selected Building" }) as HTMLInputElement)
        .value,
    ).toBe("BL-2 - Second Building");
    expect(
      (screen.getByRole("textbox", { name: "Selected Floor" }) as HTMLInputElement)
        .value,
    ).toBe("Ground Floor");
    expect(
      (screen.getByRole("textbox", { name: "Selected Room" }) as HTMLInputElement)
        .value,
    ).toBe("R-2 - Second Room");
  });

  it("resolves the building when a floor is selected", () => {
    render(<ControlledPicker />);
    fireEvent.click(screen.getAllByRole("button", { name: "Select..." })[1]);
    const dialog = screen.getByRole("dialog", { name: "Select Floor" });
    fireEvent.change(within(dialog).getByRole("searchbox"), {
      target: { value: "Ground Floor" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Select" }));

    expect(
      (screen.getByRole("textbox", { name: "Selected Building" }) as HTMLInputElement)
        .value,
    ).toBe("BL-2 - Second Building");
    expect(
      (screen.getByRole("textbox", { name: "Selected Floor" }) as HTMLInputElement)
        .value,
    ).toBe("Ground Floor");
    expect(
      (screen.getByRole("textbox", { name: "Selected Room" }) as HTMLInputElement)
        .value,
    ).toBe("All Rooms");
  });

  it("clears conflicting children when the selected building changes", () => {
    render(
      <ControlledPicker
        initialBuilding={buildings[0]}
        initialFloor={floors[1]}
        initialRoom={rooms[0]}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Select..." })[0]);
    const dialog = screen.getByRole("dialog", { name: "Select Building" });
    fireEvent.change(within(dialog).getByRole("searchbox"), {
      target: { value: "BL-1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Select" }));

    expect(
      (screen.getByRole("textbox", { name: "Selected Building" }) as HTMLInputElement)
        .value,
    ).toBe("BL-1 - First Building");
    expect(
      (screen.getByRole("textbox", { name: "Selected Floor" }) as HTMLInputElement)
        .value,
    ).toBe("All Floors");
    expect(
      (screen.getByRole("textbox", { name: "Selected Room" }) as HTMLInputElement)
        .value,
    ).toBe("All Rooms");
  });

  it("cascades clear actions from parents to children", () => {
    render(
      <ControlledPicker
        initialBuilding={buildings[0]}
        initialFloor={floors[1]}
        initialRoom={rooms[0]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear Building" }));

    expect(
      (screen.getByRole("textbox", { name: "Selected Building" }) as HTMLInputElement)
        .value,
    ).toBe("All Buildings");
    expect(
      (screen.getByRole("textbox", { name: "Selected Floor" }) as HTMLInputElement)
        .value,
    ).toBe("All Floors");
    expect(
      (screen.getByRole("textbox", { name: "Selected Room" }) as HTMLInputElement)
        .value,
    ).toBe("All Rooms");
  });

  it("clears a floor and its room while retaining the building", () => {
    render(
      <ControlledPicker
        initialBuilding={buildings[0]}
        initialFloor={floors[1]}
        initialRoom={rooms[0]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear Floor" }));

    expect(
      (screen.getByRole("textbox", { name: "Selected Building" }) as HTMLInputElement)
        .value,
    ).toBe("BL-2 - Second Building");
    expect(
      (screen.getByRole("textbox", { name: "Selected Floor" }) as HTMLInputElement)
        .value,
    ).toBe("All Floors");
    expect(
      (screen.getByRole("textbox", { name: "Selected Room" }) as HTMLInputElement)
        .value,
    ).toBe("All Rooms");
  });

  it("keeps equipment selection staged until confirm and preserves list sorting", () => {
    const onEquipmentChange = vi.fn();
    render(<ControlledPicker onEquipmentChange={onEquipmentChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Select..." })[3]);
    const dialog = screen.getByRole("dialog", { name: "Select Equipment" });
    const equipmentRows = within(dialog).getAllByRole("article");
    expect(within(equipmentRows[0]).getByText("EQ: EQ-1")).toBeTruthy();
    expect(within(equipmentRows[1]).getByText("EQ: EQ-2")).toBeTruthy();

    fireEvent.click(within(equipmentRows[0]).getByRole("button", { name: "Select" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onEquipmentChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Select..." })[3]);
    const reopenedDialog = screen.getByRole("dialog", { name: "Select Equipment" });
    const firstRow = within(reopenedDialog).getAllByRole("article")[0];
    fireEvent.click(within(firstRow).getByRole("button", { name: "Select" }));
    fireEvent.click(
      within(reopenedDialog).getByRole("button", { name: "Confirm Selection" }),
    );
    expect(onEquipmentChange).toHaveBeenCalledWith(new Set(["EQ-1"]));
  });
});
