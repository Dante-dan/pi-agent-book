# 退款事件导出说明
文档编号 EVENTS-02。
event_id 是事件唯一标识；order_ref 对应 orders.csv 的 order_id；kind=requested 表示提交申请，kind=completed 表示退款完成。此表为截至当前导出时的累计事件，每个完成事件都对应一项申请。
数订单时应按 order_ref 去重，不能直接数事件行。观察时长不一致，当前完成率不能当作最终完成率。
