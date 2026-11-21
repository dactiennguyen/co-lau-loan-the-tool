import { useCallback, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Popover } from "@/components/Popover";
import { ELEMENT_ICON, ELEMENT_NAME, elementText } from "@/components/ElementTag";
import { GENDER_ICON, GENDER_TEXT } from "@/game/gender";
import { QUALITY_TEXT } from "@/game/quality";
import { cn } from "@/utils/cn";

/** A corner mark as ItemSlot draws it: the dark plate and the pixel figure. */
const MARK = "px inline-grid place-items-center min-w-[22px] h-[16px] px-0.5 bg-[rgb(15_17_21/0.75)] text-11 leading-none";
const ICON_MARK = "inline-grid place-items-center size-[16px] bg-ink";
const HEAD = "m-0 font-display font-extrabold text-[10.5px] leading-[1.2] tracking-[0.06em] uppercase text-fg-2";

function Row({ mark, children }: { mark: ReactNode; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
      <span className="flex items-center gap-1">{mark}</span>
      <span className="text-11 leading-[1.4] text-fg-2">{children}</span>
    </li>
  );
}

/** The "?" after the title of Túi đồ: a click opens how to read a slot (the colours of quality, the element and gender
 * signs, the level, cường hoá, quantity, wear) and what the buttons do. */
export function BagLegend() {
  const [open, setOpen] = useState(false);
  const frame = useRef<HTMLSpanElement>(null);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) frame.current?.querySelector("button")?.focus();
  }, []);
  return (
    <span ref={frame} className="inline-flex flex-none">
      <button
        type="button"
        className={cn(
          // The square "?" of Hint, opened by a click rather than the pointer.
          "grid place-items-center size-[18px] p-0 border-0 notch-sm bg-card-2 text-fg-3 font-pixel font-normal text-11 leading-none cursor-help bevel-sm",
          "hover:bg-line hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
          open && "bg-line text-fg",
        )}
        aria-label="Cách đọc túi đồ"
        title="Cách đọc túi đồ"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ?
      </button>
      {open && (
        <Popover anchor={frame} label="Cách đọc túi đồ" onClose={close} className="w-[370px] max-h-[min(520px,80vh)] overflow-y-auto scroll">
          <p className={HEAD}>Số cấp: màu là phẩm chất</p>
          <ul className="grid gap-1.5 m-0 p-0 list-none">
            <Row
              mark={[0, 1, 2, 3].map((q) => (
                <b key={q} className={cn(MARK, "min-w-0", QUALITY_TEXT[q] ?? "text-fg")}>
                  51
                </b>
              ))}
            >
              Số ở góc dưới phải trang bị là <b className="text-fg">cấp mặc</b>. Màu: <b className="text-fg">Thường</b> trắng,{" "}
              <b className={QUALITY_TEXT[1]}>Hiếm</b> xanh lá, <b className={QUALITY_TEXT[2]}>Quý</b> xanh dương,{" "}
              <b className={QUALITY_TEXT[3]}>Sử Thi</b> tím.
            </Row>
            <Row mark={<b className={cn(MARK, "text-fg underline decoration-danger decoration-2 underline-offset-1")}>51</b>}>
              Gạch đỏ dưới số, icon mờ: nhân vật <b className="text-fg">chưa đủ cấp</b> để mặc.
            </Row>
          </ul>
          <p className={HEAD}>Ký hiệu trên ô</p>
          <ul className="grid gap-1.5 m-0 p-0 list-none">
            <Row mark={<b className={cn(MARK, "text-primary")}>+3</b>}>
              Góc trên phải: <b className="text-fg">cấp cường hoá</b> (nâng ở Tiện ích → Nâng cấp).
            </Row>
            <Row
              mark={[1, 2, 4].map((e) => (
                <span key={e} className={cn(ICON_MARK, elementText(e))}>
                  <Icon name={ELEMENT_ICON[e]} size={11} />
                </span>
              ))}
            >
              Góc trên trái: <b className="text-fg">hệ</b> của trang bị: <b className={elementText(1)}>{ELEMENT_NAME[1]}</b> (lửa),{" "}
              <b className={elementText(2)}>{ELEMENT_NAME[2]}</b> (sét), <b className={elementText(4)}>{ELEMENT_NAME[4]}</b> (giọt nước).
              Mặc đúng hệ nhân vật được <b className="text-fg">+5% chỉ số</b>.
            </Row>
            <Row
              mark={[0, 1].map((g) => (
                <span key={g} className={cn(ICON_MARK, GENDER_TEXT[g])}>
                  <Icon name={GENDER_ICON[g]} size={12} />
                </span>
              ))}
            >
              Góc dưới trái: chỉ <b className={GENDER_TEXT[0]}>nam</b> hay chỉ <b className={GENDER_TEXT[1]}>nữ</b> mặc được; tô đỏ khi khác
              giới nhân vật. Không có dấu thì ai cũng mặc được.
            </Row>
            <Row mark={<b className={cn(MARK, "text-fg")}>12</b>}>
              Góc dưới phải của vật phẩm (không phải trang bị): <b className="text-fg">số lượng</b> trong chồng.
            </Row>
            <Row
              mark={
                <span className="grid gap-1 w-[44px]">
                  <span className="block h-[3px] bg-bg-2">
                    <span className="block h-full w-2/3 bg-good" />
                  </span>
                  <span className="block h-[3px] bg-hp" />
                </span>
              }
            >
              Thanh dưới đồ đang mặc: <b className="text-fg">độ bền</b>. Ô đỏ là đồ hỏng, cần Búa Sửa Chữa (nút Sửa, hay Tự sửa đồ).
            </Row>
          </ul>
          <p className={HEAD}>Thao tác</p>
          <ul className="grid gap-1 m-0 pl-4 text-11 leading-[1.45] text-fg-2">
            <li>Bấm một món: dải dưới cùng hiện chi tiết và các nút Mặc, Dùng, Cởi ra, Sửa, Vứt bỏ.</li>
            <li>Chuột phải vào món: menu với đúng các nút đó.</li>
            <li>Xóa nhiều: chọn nhiều trang bị rồi vứt một lần. Sắp xếp: dồn các món lấp ô trống.</li>
          </ul>
        </Popover>
      )}
    </span>
  );
}
