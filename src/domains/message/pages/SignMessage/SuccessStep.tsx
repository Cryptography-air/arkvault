import { Services } from "@ardenthq/sdk";
import { Contracts as ProfileContracts } from "@ardenthq/sdk-profiles";
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";

import { Address } from "@/app/components/Address";
import { Avatar } from "@/app/components/Avatar";
import { FormField, FormLabel } from "@/app/components/Form";
import { StepHeader } from "@/app/components/StepHeader";
import { TextArea } from "@/app/components/TextArea";
import { TransactionDetail } from "@/domains/transaction/components/TransactionDetail";
import { useBreakpoint } from "@/app/hooks";

export const SuccessStep = ({
	signedMessage,
	wallet,
}: {
	signedMessage: Services.SignedMessage;
	wallet: ProfileContracts.IReadWriteWallet;
}) => {
	const { t } = useTranslation();

	const { isMdAndAbove } = useBreakpoint();

	const messageReference = useRef();
	const walletAlias = wallet.alias();

	/* istanbul ignore next */
	const iconSize = isMdAndAbove ? "lg" : "xs";

	return (
		<section>
			<StepHeader title={t("MESSAGE.PAGE_SIGN_MESSAGE.SUCCESS_STEP.TITLE")} />

			<TransactionDetail
				className="mt-4 md:mt-2"
				borderPosition="bottom"
				label={t("COMMON.SIGNATORY")}
				extra={<Avatar size={iconSize} address={wallet.address()} />}
			>
				<div className="w-0 flex-1 text-right md:text-left">
					<Address walletName={walletAlias} address={wallet.address()} />
				</div>
			</TransactionDetail>

			<TransactionDetail borderPosition="bottom" label={t("COMMON.MESSAGE")}>
				<span className="min-w-0 whitespace-normal break-words text-right md:text-left">
					{signedMessage.message}
				</span>
			</TransactionDetail>

			<div className="pt-4 md:pt-6">
				<FormField name="json-signature">
					<FormLabel label={t("MESSAGE.PAGE_SIGN_MESSAGE.FORM_STEP.JSON_STRING")} />
					<TextArea
						className="py-4"
						wrap="hard"
						ref={messageReference}
						defaultValue={JSON.stringify(signedMessage)}
						disabled
					/>
				</FormField>
			</div>
		</section>
	);
};
